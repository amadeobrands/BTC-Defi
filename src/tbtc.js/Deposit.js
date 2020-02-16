import BitcoinHelpers from "./BitcoinHelpers.js";

import EthereumHelpers from "./EthereumHelpers.js";

import TruffleContract from "@truffle/contract";

import Redemption from "./Redemption.js";

import TBTCConstantsJSON from "@keep-network/tbtc/artifacts/TBTCConstants.json";
import TBTCSystemJSON from "@keep-network/tbtc/artifacts/TBTCSystem.json";
import TBTCDepositTokenJSON from "@keep-network/tbtc/artifacts/TBTCDepositToken.json";
import DepositJSON from "@keep-network/tbtc/artifacts/Deposit.json";
import DepositLogJSON from "@keep-network/tbtc/artifacts/DepositLog.json";
import DepositFactoryJSON from "@keep-network/tbtc/artifacts/DepositFactory.json";
import TBTCTokenJSON from "@keep-network/tbtc/artifacts/TBTCToken.json";
import FeeRebateTokenJSON from "@keep-network/tbtc/artifacts/FeeRebateToken.json";
import VendingMachineJSON from "@keep-network/tbtc/artifacts/VendingMachine.json";
import ECDSAKeepJSON from "@keep-network/tbtc/artifacts/ECDSAKeep.json";
const TBTCConstants = TruffleContract(TBTCConstantsJSON);
const TBTCSystemContract = TruffleContract(TBTCSystemJSON);
const TBTCDepositTokenContract = TruffleContract(TBTCDepositTokenJSON);
const DepositContract = TruffleContract(DepositJSON);
const DepositFactoryContract = TruffleContract(DepositFactoryJSON);
const TBTCTokenContract = TruffleContract(TBTCTokenJSON);
const FeeRebateTokenContract = TruffleContract(FeeRebateTokenJSON);
const VendingMachineContract = TruffleContract(VendingMachineJSON);
const ECDSAKeepContract = TruffleContract(ECDSAKeepJSON);

export class DepositFactory {
  // config/*: TBTCConfig*/;

  // constantsContract/*: any */;
  // systemContract/*: any*/;
  // tokenContract/*: any */;
  // depositTokenContract/*: any*/;
  // feeRebateTokenContract/*: any */;
  // depositContract/*: any*/;
  // depositLogContract/*: any*/;
  // depositFactoryContract/*: any */;
  // vendingMachineContract/*: any */;

  static async withConfig(
    config /*: TBTCConfig)*/
  ) /*: Promise<DepositFactory>*/ {
    const statics = new DepositFactory(config);
    await statics.resolveContracts();

    BitcoinHelpers.setElectrumConfig(config.electrum);

    return statics;
  }

  constructor(config /*: TBTCConfig*/) {
    this.config = config;
  }

  async availableSatoshiLotSizes() /*: Promise<BN[]>*/ {
    return await this.systemContract.getAllowedLotSizes();
  }

  /**
   * Opens a new deposit with the given lot size in satoshis and returns a
   * Deposit handle to it. If the lot size is not currently permitted by the
   * tBTC system, throws an error. If a contract issue occurs during the
   * opening of the deposit, throws an issue.
   *
   * To follow along once the deposit is initialized, see the `Deposit` API.
   *
   * @param satoshiLotSize The lot size, in satoshis, of the deposit. Must be
   *        in the list of allowed lot sizes from Deposit.availableLotSizes().
   */
  async withSatoshiLotSize(satoshiLotSize /*: BN*/) /*: Promise<Deposit>*/ {
    if (!(await this.systemContract.isAllowedLotSize(satoshiLotSize))) {
      throw new Error(
        `Lot size ${satoshiLotSize} is not permitted; only ` +
          `one of ${(await this.availableSatoshiLotSizes()).join(",")} ` +
          `can be used.`
      );
    }

    const deposit = Deposit.forLotSize(this, satoshiLotSize);
    return deposit;
  }

  async withAddress(depositAddress) {
    return await Deposit.forAddress(this, depositAddress);
  }

  // Await the deployed() functions of all contract dependencies.
  async resolveContracts() {
    const init = ([contract, propertyName]) => {
      contract.setProvider(this.config.web3.currentProvider);
      return contract.deployed().then(_ => (this[propertyName] = _));
    };

    const contracts = [
      [TBTCConstants, "constantsContract"],
      [TBTCSystemContract, "systemContract"],
      [TBTCTokenContract, "tokenContract"],
      [TBTCDepositTokenContract, "depositTokenContract"],
      [FeeRebateTokenContract, "feeRebateTokenContract"],
      [DepositContract, "depositContract"],
      [DepositFactoryContract, "depositFactoryContract"],
      [VendingMachineContract, "vendingMachineContract"]
    ];

    await Promise.all(contracts.map(init));
  }

  /**
   * INTERNAL USE ONLY
   *
   * Initializes a new deposit and returns a tuple of the deposit contract
   * address and the associated keep address.
   */
  async createNewDepositContract(lotSize /*: BN */) {
    const funderBondAmount = await this.constantsContract.getFunderBondAmount();
    const accountBalance = await this.config.web3.eth.getBalance(
      this.config.web3.eth.defaultAccount
    );
    if (funderBondAmount.lt(accountBalance)) {
      throw `Insufficient balance ${accountBalance.toString()} to open ` +
        `deposit (required: ${funderBondAmount.toString()}).`;
    }

    const result = await this.depositFactoryContract.createDeposit(
      this.systemContract.address,
      this.tokenContract.address,
      this.depositTokenContract.address,
      this.feeRebateTokenContract.address,
      this.vendingMachineContract.address,
      1,
      1,
      lotSize,
      {
        from: this.config.web3.eth.defaultAccount,
        value: funderBondAmount
      }
    );

    const createdEvent = EthereumHelpers.readEventFromTransaction(
      this.config.web3,
      result,
      this.systemContract,
      "Created"
    );
    if (!createdEvent) {
      throw new Error(
        `Transaction failed to include keep creation event. ` +
          `Transaction was: ${JSON.stringify(result)}.`
      );
    }

    return {
      depositAddress: createdEvent._depositContractAddress,
      keepAddress: createdEvent._keepAddress
    };
  }
}

// Bitcoin address handlers are given the deposit's Bitcoin address.
// type BitcoinAddressHandler = (address: string)=>void)=>void
// Active handlers are given the deposit that just entered the ACTIVE state.
// type ActiveHandler = (deposit: Deposit)=>void

export default class Deposit {
  // factory/*: DepositFactory*/;
  // address/*: string*/;
  // keepContract/*: string*/;
  // contract/*: any*/;

  // bitcoinAddress/*: Promise<string>*/;
  // activeStatePromise/*: Promise<[]>*/; // fulfilled when deposit goes active

  static async forLotSize(
    factory /*: DepositFactory*/,
    satoshiLotSize /*: BN*/
  ) /*: Promise<Deposit>*/ {
    console.log(
      "Creating new deposit contract with lot size",
      satoshiLotSize.toNumber(),
      "satoshis..."
    );
    const {
      depositAddress,
      keepAddress
    } = await factory.createNewDepositContract(satoshiLotSize);
    console.log(
      `Looking up new deposit with address ${depositAddress} backed by ` +
        `keep at address ${keepAddress}...`
    );
    const contract = await DepositContract.at(depositAddress);

    ECDSAKeepContract.setProvider(factory.config.web3.currentProvider);
    const keepContract = await ECDSAKeepContract.at(keepAddress);

    return new Deposit(factory, contract, keepContract);
  }

  static async forAddress(
    factory /*: DepositFactory*/,
    address /*: string*/
  ) /*: Promise<Deposit>*/ {
    console.log(`Looking up Deposit contract at address ${address}...`);
    const contract = await DepositContract.at(address);

    console.log(`Looking up Created event for deposit ${address}...`);
    const createdEvent = await EthereumHelpers.getExistingEvent(
      factory.systemContract,
      "Created",
      { _depositContractAddress: address }
    );
    if (!createdEvent) {
      throw new Error(
        `Could not find creation event for deposit at address ${address}.`
      );
    }

    console.log(`Found keep address ${createdEvent.args._keepAddress}.`);
    ECDSAKeepContract.setProvider(factory.config.web3.currentProvider);
    const keepContract = await ECDSAKeepContract.at(
      createdEvent.args._keepAddress
    );

    return new Deposit(factory, contract, keepContract);
  }

  static async forTDT(
    factory /*: DepositFactory*/,
    tdt /*: TBTCDepositToken | string*/
  ) /*: Promise<Deposit>*/ {
    return new Deposit(factory, "");
  }

  constructor(
    factory /*: DepositFactory*/,
    depositContract /*: TruffleContract*/,
    keepContract /*: TruffleContract */
  ) {
    if (!keepContract) {
      throw "Keep contract required for Deposit instantiation.";
    }

    this.factory = factory;
    this.address = depositContract.address;
    this.keepContract = keepContract;
    this.contract = depositContract;

    // Set up state transition promises.
    this.activeStatePromise = this.waitForActiveState();

    this.publicKeyPoint = this.findOrWaitForPublicKeyPoint();
    this.bitcoinAddress = this.publicKeyPoint.then(
      this.publicKeyPointToBitcoinAddress.bind(this)
    );
  }

  ///------------------------------- Accessors -------------------------------

  /**
   * Returns a promise that resolves to the lot size of the deposit, in
   * satoshis.
   */
  async getSatoshiLotSize() {
    return await this.contract.lotSizeSatoshis();
  }

  /**
   * Returns a promise that resolves to the Bitcoin address for the wallet
   * backing this deposit. May take an extended amount of time if this deposit
   * has just been created.
   */
  async getBitcoinAddress() {
    return await this.bitcoinAddress;
  }

  async getTDT() /*: Promise<TBTCDepositToken>*/ {
    return {};
  }

  async getFRT() /*: Promise<FeeRebateToken | null>*/ {
    return {};
  }

  async getOwner() /*: Promise<string>*/ /* ETH address */ {
    return await this.factory.depositTokenContract.ownerOf(this.address);
  }

  async inVendingMachine() /*: Promise<boolean>*/ {
    return (
      (await this.getOwner()) == this.factory.vendingMachineContract.address
    );
  }

  ///---------------------------- Event Handlers -----------------------------

  /**
   * Registers a handler for notification when a Bitcoin address is available
   * for this deposit. The handler receives the deposit signer wallet's
   * address.
   *
   * @param bitcoinAddressHandler A function that takes a bitcoin address
   *        corresponding to this deposit's signer wallet. Note that
   *        exceptions in this handler are not managed, so the handler itself
   *        should deal with its own failure possibilities.
   */
  onBitcoinAddressAvailable(bitcoinAddressHandler /*: BitcoinAddressHandler*/) {
    this.bitcoinAddress.then(bitcoinAddressHandler);
  }

  /**
   * Registers a handler for notification when the deposit enters the ACTIVE
   * state, when it has been proven funded and becomes eligible for TBTC
   * minting and other uses. The deposit itself is passed to the handler.
   *
   * @param activeHandler A handler called when this deposit enters the ACTIVE
   *        state; receives the deposit as its only parameter. Note that
   *        exceptions in this handler are not managed, so the handler itself
   *        should deal with its own failure possibilities.
   */
  onActive(activeHandler /*: (Deposit)=>void*/) {
    this.activeStatePromise.then(() => {
      activeHandler(this);
    });
  }

  onReadyForProof(proofHandler /*: (prove)=>void*/) {
    // prove(txHash) is a thing, will submit funding proof for the given
    // Bitcoin txHash; no verification initially.
  }

  ///--------------------------- Deposit Actions -----------------------------

  /**
   * Mints TBTC from this deposit by giving ownership of it to the tBTC
   * Vending Machine contract in exchange for TBTC. Requires that the deposit
   * already be qualified, i.e. in the ACTIVE state.
   *
   * @return A promise to the amount of TBTC that was minted to the deposit
   *         owner.
   */
  async mintTBTC() /*: Promise<BN>*/ {
    if (!(await this.contract.inActive())) {
      throw new Error(
        "Can't mint TBTC with a deposit that isn't in ACTIVE state."
      );
    }

    console.log(
      `Approving transfer of deposit ${this.address} TDT to Vending Machine...`
    );
    await this.factory.depositTokenContract.approve(
      this.factory.vendingMachineContract.address,
      this.address,
      { from: this.factory.config.web3.eth.defaultAccount }
    );

    console.log(`Minting TBTC...`);
    const transaction = await this.factory.vendingMachineContract.tdtToTbtc(
      this.address,
      { from: this.factory.config.web3.eth.defaultAccount }
    );

    // return TBTC minted amount
    const transferEvent = EthereumHelpers.readEventFromTransaction(
      this.factory.config.web3,
      transaction,
      this.factory.tokenContract,
      "Transfer"
    );

    console.log(`Found Transfer event for`, transferEvent.value, `TBTC.`);
    return transferEvent.value;
  }

  /**
   * Finds a funding transaction to this deposit's funding address with the
   * appropriate number of confirmations, then calls the tBTC Vending
   * Machine's shortcut function to simultaneously qualify the deposit and
   * mint TBTC off of it, transferring ownership of the deposit to the
   * Vending Machine.
   *
   * @return A promise to the amount of TBTC that was minted to the deposit
   *         owner.
   *
   * @throws When there is no existing Bitcoin funding transaction with the
   *         appropriate number of confirmations, or if there is an issue
   *         in the Vending Machine's qualification + minting process.
   */
  async qualifyAndMintTBTC() /*: Promise<BN>*/ {
    const address = await this.bitcoinAddress;
    const expectedValue = (await this.getSatoshiLotSize()).toNumber();
    const tx = await BitcoinHelpers.Transaction.find(address, expectedValue);
    if (!tx) {
      throw new Error(
        `Funding transaction not found for deposit ${this.address}.`
      );
    }

    const requiredConfirmations = (
      await this.factory.constantsContract.getTxProofDifficultyFactor()
    ).toNumber();
    const confirmations = await BitcoinHelpers.Transaction.checkForConfirmations(
      tx,
      requiredConfirmations
    );
    if (!confirmations) {
      throw new Error(
        `Funding transaction did not have sufficient confirmations; ` +
          `expected ${requiredConfirmations.toNumber()}.`
      );
    }

    console.log(
      `Approving transfer of deposit ${this.address} TDT to Vending Machine...`
    );
    await this.factory.depositTokenContract.approve(
      this.factory.vendingMachineContract.address,
      this.address,
      { from: this.factory.config.web3.eth.defaultAccount }
    );

    console.log(
      `Qualifying and minting off of deposit ${this.address} for ` +
        `Bitcoin transaction ${tx.transactionID}...`,
      tx,
      confirmations
    );
    const proofArgs = await this.constructFundingProof(
      tx,
      requiredConfirmations
    );
    proofArgs.unshift(this.address);
    proofArgs.push({ from: this.factory.config.web3.eth.defaultAccount });
    const transaction = await this.factory.vendingMachineContract.unqualifiedDepositToTbtc.apply(
      this.factory.vendingMachineContract,
      proofArgs
    );

    // return TBTC minted amount
    const transferEvent = EthereumHelpers.readEventFromTransaction(
      this.factory.config.web3,
      transaction,
      this.factory.tokenContract,
      "Transfer"
    );

    return transferEvent.value.div(
      this.factory.config.web3.utils.toBN(10).pow(18)
    );
  }

  /**
   * Returns the cost, in TBTC, to redeem this deposit. If the deposit is in
   * the tBTC Vending Machine, includes the cost of retrieving it from the
   * Vending Machine.
   *
   * @return A promise to the amount of TBTC needed to redeem this deposit.
   */
  async getRedemptionCost() /*: Promise<BN>*/ {
    if (await this.inVendingMachine()) {
      const ownerRedemptionRequirement = await this.contract.getOwnerRedemptionTbtcRequirement(
        this.factory.config.web3.eth.defaultAccount
      );
      const lotSize = await this.getSatoshiLotSize();

      const toBN = this.factory.config.web3.utils.toBN;
      return lotSize
        .mul(toBN(10).pow(toBN(10)))
        .add(ownerRedemptionRequirement);
    } else {
      return await this.contract.getRedemptionTbtcRequirement(
        this.factory.config.web3.eth.defaultAccount
      );
    }
  }

  async getCurrentRedemption() /*: Promise<Redemption?>*/ {
    const details = await this.getLatestRedemptionDetails();

    return new Redemption(this, details);
  }

  async requestRedemption(
    redeemerAddress /*: string /* bitcoin address */
  ) /*: Promise<Redemption>*/ {
    const inVendingMachine = await this.inVendingMachine();
    const thisAccount = this.factory.config.web3.eth.defaultAccount;
    const owner = await this.getOwner();
    const belongsToThisAccount = owner == thisAccount;

    if (!inVendingMachine && !belongsToThisAccount) {
      throw new Error(
        `Redemption is currently only supported for deposits owned by ` +
          `this account (${thisAccount}) or the tBTC Vending Machine ` +
          `(${this.factory.vendingMachineContract.address}). This ` +
          `deposit is owned by ${owner}.`
      );
    }

    const redeemerPKH = BitcoinHelpers.Address.pubKeyHashFrom(redeemerAddress);
    if (redeemerPKH === null) {
      throw new Error(
        `${redeemerAddress} is not a P2WPKH address. Currently only ` +
          `P2WPKH addresses are supported for redemption.`
      );
    }

    const redemptionCost = await this.getRedemptionCost();
    const availableBalance = await this.factory.tokenContract.balanceOf(
      thisAccount
    );
    if (redemptionCost.gt(availableBalance)) {
      throw new Error(
        `Account ${thisAccount} does not have the required balance of ` +
          `${redemptionCost.toString()} to redeem; it only has ` +
          `${availableBalance.toString()} available.`
      );
    }

    const toBN = this.factory.config.web3.utils.toBN;
    console.log(
      `Looking up UTXO size and transaction fee for redemption transaction...`
    );
    const transactionFee = await BitcoinHelpers.Transaction.estimateFee(
      this.factory.constantsContract
    );
    const utxoSize = await this.contract.utxoSize();
    const outputValue = toBN(utxoSize).sub(toBN(transactionFee));
    const outputValueBytes = outputValue.toArrayLike(Buffer, "le", 8);

    let transaction;
    if (inVendingMachine) {
      console.log(
        `Approving transfer of ${redemptionCost} to the vending machine....`
      );
      this.factory.tokenContract.approve(
        this.factory.vendingMachineContract.address,
        redemptionCost,
        { from: thisAccount }
      );

      console.log(
        `Initiating redemption of deposit ${this.address} from ` +
          `vending machine...`
      );
      transaction = await this.factory.vendingMachineContract.tbtcToBtc(
        this.address,
        outputValueBytes,
        redeemerPKH,
        thisAccount,
        { from: thisAccount }
      );
    } else {
      console.log(`Approving transfer of ${redemptionCost} to the deposit...`);
      this.factory.tokenContract.approve(this.address, redemptionCost, {
        from: thisAccount
      });

      console.log(`Initiating redemption from deposit ${this.address}...`);
      transaction = await this.contract.requestRedemption(
        outputValueBytes,
        redeemerPKH,
        { from: thisAccount }
      );
    }

    const redemptionRequest = EthereumHelpers.readEventFromTransaction(
      this.factory.config.web3,
      transaction,
      this.factory.systemContract,
      "RedemptionRequested"
    );
    const redemptionDetails = this.redemptionDetailsFromEvent(
      redemptionRequest
    );

    return new Redemption(this, redemptionDetails);
  }

  /**
   * Fetches the latest redemption details from the chain. These can change
   * after fee bumps.
   *
   * Returns a promise to the redemption details, or to null if there is no
   * current redemption in progress.
   */
  async getLatestRedemptionDetails() {
    // If the contract is ACTIVE, there's definitely no redemption. This can
    // be generalized to a state check that the contract is either
    // AWAITING_WITHDRAWAL_SIGNATURE or AWAITING_WITHDRAWAL_PROOF, but let's
    // hold on that for now.
    if (await this.contract.inActive()) {
      return null;
    }

    const redemptionRequest = await EthereumHelpers.getExistingEvent(
      this.factory.systemContract,
      "RedemptionRequested",
      { _depositContractAddress: this.address }
    );

    if (!redemptionRequest) {
      return null;
    }

    return this.redemptionDetailsFromEvent(redemptionRequest.args);
  }

  ///------------------------------- Helpers ---------------------------------

  // autoSubmitting/*: boolean*/
  /**
   * This method enables the deposit's auto-submission capabilities. In
   * auto-submit mode, the deposit will automatically monitor for a new
   * Bitcoin transaction to the deposit signers' Bitcoin wallet, then watch
   * that transaction until it has accumulated sufficient work for proof
   * of funding to be submitted to the deposit, then submit that proof to the
   * deposit to qualify it and move it into the ACTIVE state.
   *
   * Without calling this function, the deposit will do none of those things;
   * instead, the caller will be in charge of managing (or choosing not to)
   * this process. This can be useful, for example, if a dApp wants to open
   * a deposit, then transfer the deposit to a service provider who will
   * handle deposit qualification.
   */
  autoSubmit() {
    // Only enable auto-submitting once.
    if (this.autoSubmitting) {
      return;
    }
    this.autoSubmitting = true;

    this.bitcoinAddress.then(async address => {
      const expectedValue = (await this.getSatoshiLotSize()).toNumber();

      console.log(
        `Monitoring Bitcoin for transaction to address ${address}...`
      );
      const tx = await BitcoinHelpers.Transaction.findOrWaitFor(
        address,
        expectedValue
      );
      // TODO issue event when we find a tx

      const requiredConfirmations = (
        await this.factory.constantsContract.getTxProofDifficultyFactor()
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
        `Submitting funding proof to deposit ${this.address} for ` +
          `Bitcoin transaction ${tx.transactionID}...`
      );
      const proofArgs = await this.constructFundingProof(
        tx,
        requiredConfirmations
      );
      proofArgs.push({ from: this.factory.config.web3.eth.defaultAccount });
      this.contract.provideBTCFundingProof.apply(this.contract, proofArgs);
    });
  }

  // Finds an existing event from the keep backing the Deposit to access the
  // keep's public key, then submits it to the deposit to transition from
  // state AWAITING_SIGNER_SETUP to state AWAITING_BTC_FUNDING_PROOF and
  // provide access to the Bitcoin address for the deposit.
  //
  // Note that the client must do this public key submission to the deposit
  // manually; the deposit is not currently informed by the Keep of its newly-
  // generated pubkey for a variety of reasons.
  //
  // Returns a promise that will be fulfilled once the public key is
  // available, with a public key point with x and y properties.
  async findOrWaitForPublicKeyPoint() {
    let signerPubkeyEvent = await this.readPublishedPubkeyEvent();
    if (signerPubkeyEvent) {
      console.log(
        `Found existing Bitcoin address for deposit ${this.address}...`
      );
      return {
        x: signerPubkeyEvent.args._signingGroupPubkeyX,
        y: signerPubkeyEvent.args._signingGroupPubkeyY
      };
    }

    console.log(`Waiting for deposit ${this.address} keep public key...`);

    // Wait for the Keep to be ready.
    await EthereumHelpers.getEvent(this.keepContract, "PublicKeyPublished");

    console.log(
      `Waiting for deposit ${this.address} to retrieve public key...`
    );
    // Ask the deposit to fetch and store the signer pubkey.
    const pubkeyTransaction = await this.contract.retrieveSignerPubkey({
      from: this.factory.config.web3.eth.defaultAccount
    });

    console.log(`Found public key for deposit ${this.address}...`);
    const {
      _signingGroupPubkeyX,
      _signingGroupPubkeyY
    } = EthereumHelpers.readEventFromTransaction(
      this.factory.config.web3,
      pubkeyTransaction,
      this.factory.systemContract,
      "RegisteredPubkey"
    );

    return {
      x: _signingGroupPubkeyX,
      y: _signingGroupPubkeyY
    };
  }

  // Returns a promise that is fulfilled when the contract has entered the
  // active state.
  async waitForActiveState() {
    const depositIsActive = await this.contract.inActive();
    if (depositIsActive) {
      return true;
    }

    console.log(`Monitoring deposit ${this.address} for transition to ACTIVE.`);

    // If we weren't active, wait for Funded, then mark as active.
    // FIXME/NOTE: We could be inactive due to being outside of the funding
    // FIXME/NOTE: path, e.g. in liquidation or courtesy call.
    await EthereumHelpers.getEvent(this.factory.systemContract, "Funded", {
      _depositContractAddress: this.address
    });
    console.log(`Deposit ${this.address} transitioned to ACTIVE.`);

    return true;
  }

  async readPublishedPubkeyEvent() {
    return EthereumHelpers.getExistingEvent(
      this.factory.systemContract,
      "RegisteredPubkey",
      { _depositContractAddress: this.address }
    );
  }

  async publicKeyPointToBitcoinAddress(publicKeyPoint) {
    return BitcoinHelpers.Address.publicKeyPointToP2WPKHAddress(
      publicKeyPoint.x,
      publicKeyPoint.y,
      this.factory.config.bitcoinNetwork
    );
  }

  // Given a Bitcoin transaction and the number of confirmations that need to
  // be proven constructs an SPV proof and returns the raw parameters that
  // would be given to an on-chain contract.
  //
  // These are:
  // - version
  // - txInVector
  // - txOutVector
  // - locktime
  // - outputPosition
  // - merkleProof
  // - txInBlockIndex
  // - chainHeaders
  //
  // Constructed this way to serve both qualify + mint and simple
  // qualification flows.
  async constructFundingProof(bitcoinTransaction, confirmations) {
    const { transactionID, outputPosition } = bitcoinTransaction;
    const {
      parsedTransaction,
      merkleProof,
      chainHeaders,
      txInBlockIndex
    } = await BitcoinHelpers.Transaction.getSPVProof(
      transactionID,
      confirmations
    );

    const { version, txInVector, txOutVector, locktime } = parsedTransaction;

    return [
      Buffer.from(version, "hex"),
      Buffer.from(txInVector, "hex"),
      Buffer.from(txOutVector, "hex"),
      Buffer.from(locktime, "hex"),
      outputPosition,
      Buffer.from(merkleProof, "hex"),
      txInBlockIndex,
      Buffer.from(chainHeaders, "hex")
    ];
  }

  redemptionDetailsFromEvent(
    redemptionRequestedEventArgs
  ) /*: RedemptionDetails*/ {
    const {
      _utxoSize,
      _requesterPKH,
      _requestedFee,
      _outpoint,
      _digest
    } = redemptionRequestedEventArgs;

    const toBN = this.factory.config.web3.utils.toBN;
    return {
      utxoSize: toBN(_utxoSize),
      requesterPKH: _requesterPKH,
      requestedFee: toBN(_requestedFee),
      outpoint: _outpoint,
      digest: _digest
    };
  }
}
