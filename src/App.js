import React, { Component, useState, useEffect } from "react";
import TBTC from "./tbtc.js/TBTC.js";
import BitcoinHelpers from "./tbtc.js/BitcoinHelpers";
import { Container, Row, Col } from "react-bootstrap";
import Dots from "./images/dots.svg";
import One from "./images/one.svg";
import {
  Grommet,
  Button,
  Menu,
  Box,
  Anchor,
  Heading,
  Header,
  RadioButton
} from "grommet";
import { grommet } from "grommet/themes";

// import ApolloClient, { gql, InMemoryCache } from 'apollo-boost'
// import { ApolloProvider, Query } from 'react-apollo'
// import {
//   // Grid,
//   // LinearProgress,
//   // Dialog,
//   // DialogActions,
//   // DialogContent,
//   // DialogContentText,
//   // DialogTitle,
//   Button
// } from "@material-ui/core";
import "./App.css";
// import Header from './components/Header'
// import Error from './components/Error'
// import Gravatars from './components/Gravatars'
// import Filter from './components/Filter'
import Fortmatic from "fortmatic";
import Web3 from "web3";
import "bootstrap/dist/css/bootstrap.min.css";
import styled from "styled-components";
import CreateDeposits from "./CreateDeposits.js";

import HDWalletProvider from "@truffle/hdwallet-provider";

import { useLotsAndDepositHandler, useBTCDepositListeners } from "./hooks";

const myTheme = {
  radioButton: {
    check: {
      color: '#1A5AFE',
    },
  },
  global: {
    font: {
      family: "Rubik, sans-serif !important"
    },
  }
};

const StyledDots = styled.img`
  left: 0;
  position: fixed;
  top: 104px;
`;

const StyledNumber = styled.img`
  margin-top: -11px;
  padding-right: 20px;
`;

const HeaderText = styled.div`
  font-size: 32px;
  font-weight: 500;
  display: inline;
`;

const StyledHeading = styled(Heading)`
  /* padding-top: 7px;
  padding-bottom: 5px; */
  /* padding-top: 20px; */
  background-color: white;
  margin: 0 auto;
`;

const UnderHeader = styled.div`
  padding-left: 68px;
`
const mnemonic =
  "egg dune news grocery detail frog kiwi hidden tuna noble speak over";

const provider = new HDWalletProvider(
  mnemonic,
  "https://ropsten.infura.io/v3/bf239bcb4eb2441db2ebaff8f9d80363"
);

// let fm = new Fortmatic("pk_test_001FD198F278ECC9", "ropsten");

// if (!process.env.REACT_APP_GRAPHQL_ENDPOINT) {
//   throw new Error('REACT_APP_GRAPHQL_ENDPOINT environment variable not defined')
// }

// const client = new ApolloClient({
//   uri: process.env.REACT_APP_GRAPHQL_ENDPOINT,
//   cache: new InMemoryCache(),
// })

// const GRAVATARS_QUERY = gql`
//   query gravatars($where: Gravatar_filter!, $orderBy: Gravatar_orderBy!) {
//     gravatars(first: 100, where: $where, orderBy: $orderBy, orderDirection: asc) {
//       id
//       owner
//       displayName
//       imageUrl
//     }
//   }
// `

const sendWeb3Transaction = () => {
  const { web3 } = window;
  const value = web3.utils.toWei("0.01", "ether");
  web3.eth.sendTransaction({
    // From address will automatically be replaced by the address of current user
    from: "0x0Cd462db67F44191Caf3756f033A564A0d37cf08",
    to: "0x178411f618bba04DFD715deffBdD9B6b13B958c4",
    value
  });
};

const convertToCTBTC = (ethWalletAddress, tbtcValue) => {
  const contractAddress = "0xb40d042a65dd413ae0fd85becf8d722e16bc46f1"; //ropsten
  //grab ABI from ctbtc.json
  var fs = require("fs");
  var jsonFile = "./ctbtc.json";
  var parsed = JSON.parse(fs.readFileSync(jsonFile));
  var abi = parsed.abi;

  const compoundcTBTCContract = new Web3.eth.Contract(abi, contractAddress);

  console.log("Sending ETH to the Compound Protocol...");
  compoundcTBTCContract.methods
    .mint()
    .send({
      from: ethWalletAddress,
      gasLimit: Web3.utils.toHex(150000), // posted at compound.finance/developers#gas-costs
      gasPrice: Web3.utils.toHex(20000000000), // use ethgasstation.info (mainnet only)
      value: Web3.utils.toHex(Web3.utils.toWei(tbtcValue, "ether"))
    })
    .then(result => {
      console.log('cTBTC "Mint" operation successful.');
      return compoundcTBTCContract.methods
        .balanceOfUnderlying(ethWalletAddress)
        .call();
    })
    .then(balanceOfUnderlying => {
      balanceOfUnderlying = Web3.utils.fromWei(balanceOfUnderlying).toString();
      console.log(
        "tBTC supplied to the Compound Protocol:",
        balanceOfUnderlying
      );
      return compoundcTBTCContract.methods.balanceOf(ethWalletAddress).call();
    })
    .then(cTokenBalance => {
      cTokenBalance = (cTokenBalance / 1e8).toString();
      console.log("My wallet's cTBTC Token Balance:", cTokenBalance);
    })
    .catch(error => {
      console.error(error);
    });
};

const App = () => {
  const [error, setError] = useState("");
  const [lots, setLots] = useState([]);
  const [tbtcHandler, setTbtcHandler] = useState({});
  const [depositHandler, setDepositHandler] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [depositSatoshiAmount, setDepositSatoshiAmount] = useState();
  useLotsAndDepositHandler(setError, setLots, setTbtcHandler);
  useBTCDepositListeners(depositHandler, setSubmitting, submitting);

  return (
    <Grommet theme={myTheme}>
      <Header
        pad="small"
        style={{ textAlign: "center", borderBottom: "1px solid #DFE0E5" }}
      >
        {/* <Box direction="row" gap="medium" > */}
        <StyledHeading size="small" color="#1A5AFE">
          tBTC
        </StyledHeading>
        {/* <Anchor label="Profile" href="#" /> */}
        {/* </Box> */}
      </Header>
      <Container style={{ paddingTop: "40px" }}>
        <Row>
          <Col sm={2} xs={0}>
            <StyledDots src={Dots} alt="dots for fun" />
          </Col>
          <Col sm={10} xs={12}>
            <div>
              <StyledNumber src={One} alt="first step" />
              <HeaderText>Convert BTC to TBTC</HeaderText>
            </div>
            <UnderHeader>
              {lots.map((lot, i) => {
                return (
                  <RadioButton
                    key={i}
                    checked={depositSatoshiAmount === lot}
                    onChange={() => {
                      setDepositSatoshiAmount(lot);
                    }}
                    label={lot.toString()}
                  />
                );
              })}
            </UnderHeader>
            <p>
              selected desosit amount:{" "}
              {depositSatoshiAmount && depositSatoshiAmount.toString()}
            </p>
            <button
              style={{
                cursor:
                  depositSatoshiAmount && depositSatoshiAmount.gt(0)
                    ? "pointer"
                    : "not-allowed"
              }}
              disabled={!depositSatoshiAmount || depositSatoshiAmount.lte(0)}
              onClick={async () => {
                const deposit = await tbtcHandler.Deposit.withSatoshiLotSize(
                  depositSatoshiAmount
                );
                setDepositHandler(deposit);
              }}
            >
              Submit
            </button>
          </Col>
        </Row>
      </Container>
    </Grommet>
  );
};

// class App extends Component {
//   constructor(props) {
//     super(props)
//     this.state = {
//       lots: []
//     }
//   }

//   // toggleHelpDialog = () => {
//   //   this.setState(state => ({ ...state, showHelpDialog: !state.showHelpDialog }))
//   // }

//   // gotoQuickStartGuide = () => {
//   //   window.location.href = 'https://thegraph.com/docs/quick-start'
//   // }

//   render() {
//     // const { withImage, withName, orderBy, showHelpDialog } = this.state

//     return (
//       // <ApolloProvider client={client}>
//       <div>
//         <Button onClick={() => sendWeb3Transaction()}>Test</Button>
//         <div className="App">
//           BCTCBTtcTBTC
//           {/* <Grid container direction="column">
//             <Header onHelp={this.toggleHelpDialog} />
//             <Filter
//               orderBy={orderBy}
//               withImage={withImage}
//               withName={withName}
//               onOrderBy={field => this.setState(state => ({ ...state, orderBy: field }))}
//               onToggleWithImage={() =>
//                 this.setState(state => ({ ...state, withImage: !state.withImage }))
//               }
//               onToggleWithName={() =>
//                 this.setState(state => ({ ...state, withName: !state.withName }))
//               }
//             />
//             <Grid item>
//               <Grid container>
//                 <Query
//                   query={GRAVATARS_QUERY}
//                   variables={{
//                     where: {
//                       ...(withImage ? { imageUrl_starts_with: 'http' } : {}),
//                       ...(withName ? { displayName_not: '' } : {}),
//                     },
//                     orderBy: orderBy,
//                   }}
//                 >
//                   {({ data, error, loading }) => {
//                     return loading ? (
//                       <LinearProgress variant="query" style={{ width: '100%' }} />
//                     ) : error ? (
//                       <Error error={error} />
//                     ) : (
//                       <Gravatars gravatars={data.gravatars} />
//                     )
//                   }}
//                 </Query>
//               </Grid>
//             </Grid>
//           </Grid>
//           <Dialog
//             fullScreen={false}
//             open={showHelpDialog}
//             onClose={this.toggleHelpDialog}
//             aria-labelledby="help-dialog"
//           >
//             <DialogTitle id="help-dialog">{'Show Quick Guide?'}</DialogTitle>
//             <DialogContent>
//               <DialogContentText>
//                 We have prepared a quick guide for you to get started with The Graph at
//                 this hackathon. Shall we take you there now?
//               </DialogContentText>
//             </DialogContent>
//             <DialogActions>
//               <Button onClick={this.toggleHelpDialog} color="primary">
//                 Nah, I'm good
//               </Button>
//               <Button onClick={this.gotoQuickStartGuide} color="primary" autoFocus>
//                 Yes, pease
//               </Button>
//             </DialogActions>
//           </Dialog> */}
//         </div>
//         </div>
//       // </ApolloProvider>
//     )
//   }
// }

export default App;
