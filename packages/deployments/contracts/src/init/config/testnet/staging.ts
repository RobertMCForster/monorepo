import { InitConfig } from "../../helpers";

export const TESTNET_STAGING_INIT_CONFIG: InitConfig = {
  hub: "1735353714", /// GOERLI
  supportedDomains: [
    "1735353714",
    "1735356532",
    // "1734439522", /// ARBITRUM-GOERLI
    "9991", /// MUMBAI
  ],
  assets: [
    {
      name: "TEST",
      canonical: {
        domain: "1735353714",
        address: "0x7ea6eA49B0b0Ae9c5db7907d139D9Cd3439862a1",
      },
      representations: {
        "1735356532": {
          local: "0x68Db1c8d85C09d546097C65ec7DCBFF4D6497CbF",
          adopted: "0x68Db1c8d85C09d546097C65ec7DCBFF4D6497CbF",
        },
        "9991": {
          local: "0xeDb95D8037f769B72AAab41deeC92903A98C9E16",
          adopted: "0xeDb95D8037f769B72AAab41deeC92903A98C9E16",
        },
        /// ARBITRUM-GOERLI
        // "1734439522": {
        //   local: "0xDC805eAaaBd6F68904cA706C221c72F8a8a68F9f",
        //   adopted: "0xDC805eAaaBd6F68904cA706C221c72F8a8a68F9f",
        // },
      },
    },
    {
      name: "WETH",
      canonical: {
        domain: "1735353714",
        address: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
      },
      representations: {
        "1735356532": {
          local: "0x39B061B7e41DE8B721f9aEcEB6b3f17ECB7ba63E",
          adopted: "0x74c6FD7D2Bc6a8F0Ebd7D78321A95471b8C2B806",
        },
        "9991": {
          local: "0x1E5341E4b7ed5D0680d9066aac0396F0b1bD1E69",
          adopted: "0xFD2AB41e083c75085807c4A65C0A14FDD93d55A9",
        },
        /// ARBITRUM-GOERLI
        // "1734439522": {
        //   local: "0x1346786E6A5e07b90184a1Ba58E55444b99DC4A2",
        //   adopted: "0x1346786E6A5e07b90184a1Ba58E55444b99DC4A2",
        // },
      },
    },
  ],
  agents: {
    watchers: {
      whitelist: ["0x2cfBF3D40F71ceed2997cACbafE9D31e630860CB", "0x54BAA998771639628ffC0206c3b916c466b79c89"],
    },
    routers: {
      whitelist: ["0x71dD9fc6Fe5427F0c7cd7d42Bc89eFFe11C6d4B7"],
    },
    sequencers: {
      whitelist: [
        "0x87D8bd5B49B69f93e226ecF0e87D5bEBc3f6359C",
        "0x71dD9fc6Fe5427F0c7cd7d42Bc89eFFe11C6d4B7",
        "0x24D677f8A59A486BfC6d87E9453C4f1fEfcB0958",
      ],
    },
    relayers: {
      whitelist: [
        "0xaB0A8DCb1590C4565C35cC785dc25A0590398054",
        "0xCDdE9992Fb66038Dd8419b56149a75CC79Df133C",
        "0x24D677f8A59A486BfC6d87E9453C4f1fEfcB0958",
      ],
    },
  },
};