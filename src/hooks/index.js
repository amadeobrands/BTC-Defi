import { useEffect } from "react";
import TBTC from "./tbtc.js/TBTC.js";
import BitcoinHelpers from "./tbtc.js/BitcoinHelpers";

import Fortmatic from "fortmatic";
import Web3 from "web3";

import HDWalletProvider from "@truffle/hdwallet-provider";
const mnemonic =
  "egg dune news grocery detail frog kiwi hidden tuna noble speak over";

const provider = new HDWalletProvider(
  mnemonic,
  "https://ropsten.infura.io/v3/bf239bcb4eb2441db2ebaff8f9d80363"
);

// let fm = new Fortmatic("pk_test_001FD198F278ECC9", "ropsten");

export const getLotsAndDepositHandler = (setError, setLots, setTbtcHandler) => {
  const getLots = async () => {
    const web3 = new Web3(provider);
    const [defaultAccount] = await web3.eth.getAccounts();
    console.log(defaultAccount);
    web3.eth.defaultAccount = defaultAccount;

    try {
      await web3.currentProvider.enable();
    } catch (err) {
      setError(err.message);
    }
    const tbtc = await TBTC.withConfig({
      web3,
      bitcoinNetwork: "testnet",
      electrum: {
        testnet: {
          server: "electrumx-server.test.tbtc.network",
          port: 50002,
          protocol: "ssl"
        },
        testnetPublic: {
          server: "testnet1.bauerj.eu",
          port: 50002,
          protocol: "ssl"
        },
        testnetWS: {
          server: "electrumx-server.test.tbtc.network",
          port: 50003,
          protocol: "ws"
        }
      }
    });
    const lotSizes = await tbtc.Deposit.availableSatoshiLotSizes();
    setLots(lotSizes);
    setTbtcHandler(tbtc);
  };
  getLots();
};

export const registerBTCDepositListeners = (
  depositHandler,
  setSubmitting,
  submitting
) => {
  const registerBtcTxListener = () => {
    console.log("BITCOIN TX LISTENER IS ABOUT TO GET REGISTERED");
    setSubmitting(true);
    depositHandler.onActive(async () => {
      const tbtc = await depositHandler.mintTBTC();
      window.localStorage.removeItem("deposit");
      console.log(tbtc, "SUCCESS!");
    });
    depositHandler.bitcoinAddress.then(async address => {
      window.localStorage.setItem("deposit", address);
      const expectedValue = (
        await depositHandler.getSatoshiLotSize()
      ).toNumber();
      console.log(
        `Monitoring Bitcoin for transaction to address ${address}...`
      );
      const tx = await BitcoinHelpers.Transaction.findOrWaitFor(
        address,
        expectedValue
      );

      const requiredConfirmations = (
        await depositHandler.factory.constantsContract.getTxProofDifficultyFactor()
      ).toNumber();

      console.log(
        `Waiting for ${requiredConfirmations} confirmations for ` +
          `Bitcoin transaction ${tx.transactionID}...`
      );
      await BitcoinHelpers.Transaction.waitForConfirmations(
        tx,
        requiredConfirmations
      );

      console.log(
        `Submitting funding proof to deposit ${depositHandler.address} for ` +
          `Bitcoin transaction ${tx.transactionID}...`
      );
      const proofArgs = await depositHandler.constructFundingProof(
        tx,
        requiredConfirmations
      );
      console.log("just constructed proof args", proofArgs);
      proofArgs.push({
        from: depositHandler.factory.config.web3.eth.defaultAccount
      });
      depositHandler.contract.provideBTCFundingProof.apply(
        depositHandler.contract,
        proofArgs
      );
      console.log("submitted the proof");
    });
  };
  if (depositHandler && !submitting) registerBtcTxListener();
};

export const useLotsAndDepositHandler = (setError, setLots, setTbtcHandler) =>
  useEffect(
    () => getLotsAndDepositHandler(setError, setLots, setTbtcHandler),
    []
  );
export const useBTCDepositListeners = (
  depositHandler,
  setSubmitting,
  submitting
) =>
  useEffect(
    () =>
      registerBTCDepositListeners(depositHandler, setSubmitting, submitting),
    [depositHandler, submitting, setSubmitting]
  );
