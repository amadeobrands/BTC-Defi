import { useEffect, useState } from "react";
import Box from "3box";
import TBTC from "../tbtc.js/TBTC.js";
import BitcoinHelpers from "../tbtc.js/BitcoinHelpers";

import Fortmatic from "fortmatic";
import Web3 from "web3";
const tbtcTokenAddress = "0x083f652051b9CdBf65735f98d83cc329725Aa957";
const ctbtcTokenAddress = "0xb40d042a65dd413ae0fd85becf8d722e16bc46f1"; //ropsten
const exchangeAddress = "0x242E084657F5cdcF745C03684aAeC6E9b0bB85C5"; //ROPSTEN TBTC EXCHANGE
var ctbtcABI = require("../ctbtcABI.json");
var tbtcABI = require("../TBTCABI.json");

let fm = new Fortmatic("pk_test_001FD198F278ECC9", "ropsten");
const provider = fm.getProvider();
const web3 = new Web3(provider);

export const use3Box = setStep => {
  const [pendingDepositAddress, setPendingDepositAddress] = useState("");
  const [tbtcDepositSpace, setTbtcDepositSpace] = useState(null);
  useEffect(() => {
    const fetchInfoFrom3Box = async () => {
      const [defaultAccount] = await web3.eth.getAccounts();
      const box = await Box.create(provider);
      const spaces = ["tbtc-deposit"];
      await box.auth(spaces, { address: defaultAccount });
      const tbtcDepositSpace = await box.openSpace("tbtc-deposit");
      await tbtcDepositSpace.syncDone;
      const depositAddress = await tbtcDepositSpace.public.get("tbtc-deposit");
      setStep(0);
      setPendingDepositAddress(depositAddress || "");
      setTbtcDepositSpace(tbtcDepositSpace);
    };
    fetchInfoFrom3Box();
  }, []);
  return { pendingDepositAddress, tbtcDepositSpace };
};

export const getAddressAndBalances = () => {
  const [currentAddress, setCurrentAddress] = useState("");
  const [balances, setBalances] = useState({ CTBTC: 0, TBTC: 0 });
  const [mintAllowance, setMintAllowance] = useState(0);
  const [swapAllowance, setSwapAllowance] = useState(0);
  useEffect(() => {
    const fetchBalances = async () => {
      const [currentAccount] = await web3.eth.getAccounts();
      const cTBTCContract = new web3.eth.Contract(ctbtcABI, ctbtcTokenAddress);
      const TBTCTokenContract = new web3.eth.Contract(
        tbtcABI,
        tbtcTokenAddress
      );
      console.log("CURRENT ACCOUNT", currentAccount);
      if (currentAccount) {
        console.log("CURRENT ACCOUNT2", currentAccount);
        console.log("ABI", ctbtcABI);
        const tbtcTokenContract = new web3.eth.Contract(
          ctbtcABI,
          tbtcTokenAddress
        );
        const ctbtcTokenContract = new web3.eth.Contract(
          ctbtcABI,
          ctbtcTokenAddress
        );
        let result = await tbtcTokenContract.methods
          .allowance(currentAccount, ctbtcTokenAddress)
          .call();

        let result1 = await tbtcTokenContract.methods
          .allowance(currentAccount, exchangeAddress)
          .call();
        console.log("mint allowance", result, result1);

        setCurrentAddress(currentAccount);
        let CTBTC = await cTBTCContract.methods
          .balanceOfUnderlying(currentAccount)
          .call();
        let TBTC = await TBTCTokenContract.methods
          .balanceOf(currentAccount)
          .call();
        setBalances({ CTBTC, TBTC, result, result1 });
        setMintAllowance(result);
        setSwapAllowance(result1);
        console.log(TBTC, CTBTC, mintAllowance, swapAllowance);
      } else {
        console.error("Could not get current account");
      }
    };
    fetchBalances();
  }, []);
  return { currentAddress, balances, mintAllowance, swapAllowance };
};

export const getLotsAndTbtcHandler = (setError, setLots, setTbtcHandler) => {
  const getLots = async () => {
    const web3 = new Web3(provider);
    const [defaultAccount] = await web3.eth.getAccounts();
    web3.eth.defaultAccount = defaultAccount;

    try {
      await web3.ethereum.enable();
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
  submitting,
  setStep,
  setLoading,
  setTxInFlight,
  setBitcoinDepositComplete
) => {
  const registerBtcTxListener = () => {
    console.log("BITCOIN TX LISTENER IS ABOUT TO GET REGISTERED");
    setSubmitting(true);
    depositHandler.onActive(async () => {
      const tbtc = await depositHandler.mintTBTC();
      console.log(tbtc, "SUCCESS!");
      setBitcoinDepositComplete(true);
    });
    depositHandler.bitcoinAddress.then(address =>
      onBTCAddressResolution(
        address,
        depositHandler,
        setStep,
        setLoading,
        setTxInFlight
      )
    );
  };
  if (depositHandler && !submitting) registerBtcTxListener();
};

const onBTCAddressResolution = async (
  address,
  depositHandler,
  setStep,
  setLoading,
  setTxInFlight
) => {
  console.log("BITCOIN ADDRESS JUST RESOLVED ", address);
  setStep(1);
  setLoading(false);
  const expectedValue = (await depositHandler.getSatoshiLotSize()).toNumber();
  console.log(`Monitoring Bitcoin for transaction to address ${address}...`);
  const tx = await BitcoinHelpers.Transaction.findOrWaitFor(
    address,
    expectedValue
  );
  console.log("found tx", tx);
  setTxInFlight(true);

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
};

export const usePendingDeposit = (
  tbtcHandler,
  depositAddress,
  submitting,
  setSubmitting,
  setDepositHandler,
  setStep,
  setLoading,
  setStep1SigsRequired,
  setTxInFlight,
  setBitcoinDepositComplete
) => {
  useEffect(() => {
    const listenForPendingDeposits = async () => {
      setSubmitting(true);
      const depositHandler = await tbtcHandler.Deposit.withAddress(
        depositAddress,
        setStep1SigsRequired
      );
      setDepositHandler(depositHandler);
      depositHandler.onActive(async () => {
        const tbtc = await depositHandler.mintTBTC();
        console.log(tbtc, "SUCCESS!");
        setBitcoinDepositComplete(true);
      });
      depositHandler.bitcoinAddress.then(address =>
        onBTCAddressResolution(
          address,
          depositHandler,
          setStep,
          setLoading,
          setTxInFlight
        )
      );
    };
    if (tbtcHandler && depositAddress && !submitting) {
      console.log("listening for a pending deposit");
      setStep1SigsRequired(1);
      listenForPendingDeposits();
    }
  }, [
    tbtcHandler,
    depositAddress,
    submitting,
    setSubmitting,
    setDepositHandler
  ]);
};

export const useLotsAndTbtcHandler = (setError, setLots, setTbtcHandler) =>
  useEffect(() => getLotsAndTbtcHandler(setError, setLots, setTbtcHandler), []);
export const useBTCDepositListeners = (
  depositHandler,
  setSubmitting,
  submitting,
  setStep,
  setLoading,
  setTxInFlight,
  setBitcoinDepositComplete
) =>
  useEffect(
    () =>
      registerBTCDepositListeners(
        depositHandler,
        setSubmitting,
        submitting,
        setStep,
        setLoading,
        setTxInFlight,
        setBitcoinDepositComplete
      ),
    [depositHandler, submitting, setSubmitting]
  );
