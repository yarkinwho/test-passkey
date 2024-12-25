require('dotenv').config();
import { Session } from '@wharfkit/session'
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey'
import { APIClient, PackedTransaction, SignedTransaction } from "@wharfkit/antelope"

import jayson from 'jayson';
import cors from 'cors'
import connect from 'connect'
import { json as jsonParser } from "body-parser";
import { logger } from "./utils/logger";

export interface PasskeyServiceConfig {
    JRPC_PORT,
    CHAIN_RPC,
    CHAIN_ACCOUNT,
    CHAIN_PERMISSION,
    CHAIN_PRIVATEKEY,
}

class PasskeyService {

    rpc: APIClient;
    session: Session;

    constructor(public readonly config: PasskeyServiceConfig) {
        
    }

    async init() {
        this.rpc = new APIClient({ url: this.config.CHAIN_RPC })
        const info = await this.rpc.v1.chain.get_info()

        this.session = new Session({
            actor: this.config.CHAIN_ACCOUNT,
            permission: this.config.CHAIN_PERMISSION,
            chain: {
                id: info.chain_id,
                url: this.config.CHAIN_RPC
            },
            walletPlugin: new WalletPluginPrivateKey(this.config.CHAIN_PRIVATEKEY),
        })

        // console.log(this.session.walletPlugin.metadata.publicKey)
    }

    async preparePackedTx(tx) {
        const sentTransaction = await this.session.transact(
            tx,
            {
                expireSeconds: 60,
                broadcast: false
            }
        ).then(async result => {
            const signed = SignedTransaction.from({
                ...result.resolved.transaction,
                signatures: result.signatures,
            })
            return PackedTransaction.fromSigned(signed)
        })
        return sentTransaction
    }


    async RegUser(params: any[]) {

        if (params.length != 3) {
            throw new Error("invalid parameter")
        }
        const accountName:string = params[0];
        const passkeyPermission:string = params[1];
        const passkeyPubkey:string = params[2];

        const tx = {
            actions: [
              {
                account: "eosio",
                name: "newaccount",
                authorization: [
                  {
                    actor: this.config.CHAIN_ACCOUNT,
                    permission: this.config.CHAIN_PERMISSION,
                  },
                ],
                data: {
                  creator: this.config.CHAIN_ACCOUNT,
                  name: accountName,
                  owner: {
                    threshold: 1,
                    keys: [{ key: this.session.walletPlugin.metadata.publicKey, weight: 1 }], // set server key as owner
                    accounts: [],
                    waits: [],
                  },
                  active: {
                    threshold: 1,
                    keys: [{ key: this.session.walletPlugin.metadata.publicKey, weight: 1 }], // set server key as active
                    accounts: [],
                    waits: [],
                  },
                },
              },
              {
                account: "eosio",
                name: "buyrambytes",
                authorization: [
                  {
                    actor: this.config.CHAIN_ACCOUNT,
                    permission: this.config.CHAIN_PERMISSION,
                  },
                ],
                data: {
                  payer: this.config.CHAIN_ACCOUNT.toString(),
                  receiver: accountName,
                  bytes: 8192,
                },
              },
            ],
          }

          try {
        const packed = await this.preparePackedTx(tx)
        const accountCreationResponse = await this.rpc.v1.chain.send_transaction2(packed, {
          return_failure_trace: false,
          retry_trx: true,
        })
      }
      catch(error) {
        logger.info(JSON.stringify(error, Object.getOwnPropertyNames(error)))
        throw error
      }

        logger.info("created")
        const tx2 = {
          actions: [{
            account: "eosio.token",
            name: "transfer",
            authorization: [
              {
                actor: this.config.CHAIN_ACCOUNT,
                permission: this.config.CHAIN_PERMISSION,
              },
            ],
            data: {
              from: this.config.CHAIN_ACCOUNT,
              to: accountName,
              quantity: "0.1000 EOS",
              memo: "test passkey transfer",
            },
          },
            {
              account: "eosio",
              name: "updateauth",
              authorization: [
                {
                  actor: accountName,
                  permission: "active",
                },
              ],
              data: {
                account: accountName,
                permission: passkeyPermission,
                parent: "active",
                auth: {
                  threshold: 1,
                  keys: [{ key: passkeyPubkey, weight: 1 }], // set passkey key for passkey permission
                  accounts: [],
                  waits: [],
                },
              },
            },
            {
              account: "eosio",
              name: "linkauth",
              authorization: [
                {
                  actor: accountName,
                  permission: "active",
                },
              ],
              data: {
                account:accountName,
                code:"eosio.token",
                type:"transfer",
                requirement:passkeyPermission
              },
            }



            
          ],
        }

        let accountCreationResponse2
        try {

          const packed2 = await this.preparePackedTx(tx2)
          
        accountCreationResponse2 = await this.rpc.v1.chain.send_transaction2(packed2, {
          return_failure_trace: false,
          retry_trx: true,
        })}
        catch(error) {
          logger.info(JSON.stringify(error, Object.getOwnPropertyNames(error)))
          throw error
        }
        logger.info(JSON.stringify(accountCreationResponse2, Object.getOwnPropertyNames(accountCreationResponse2)))
        
      return accountCreationResponse2.transaction_id;


    }

    async GenTx(params: any[]) {
        // Sample function that generate a transfer
        if (params.length != 2) {
            throw new Error("invalid parameter")
        }
        const accountName:string = params[0];
        const passkeyPermission:string = params[1];


        const tx = {
            actions: [
              {
                account: "eosio.token",
                name: "transfer",
                authorization: [
                  {
                    actor: accountName,
                    permission: passkeyPermission,
                  },
                ],
                data: {
                  from: accountName,
                  to: this.config.CHAIN_ACCOUNT,
                  quantity: "0.0100 EOS",
                  memo: "test passkey transfer",
                },
              },
            ],
          }
        
          return await this.preparePackedTx(tx)
    }

    async start() {
        const app = connect();
        let vm = this;
        const server = new jayson.Server({
            RegUser: function(params, callback) {
                logger.info('Received RegUserCall: ' + params[0])
                vm.RegUser(params).then((result:any) => {
                    callback(null, result);
                }).catch((error:Error) => {
                    logger.warn('Error when processing RegUser: ' + error.message)
                    callback({
                        "code": -32000,
                        "message": error.message
                    });
                });
            },

            GenTx: function(params, callback) {
                logger.info('Received GenTx: ' + params)
                vm.GenTx(params).then((result:any) => {
                    callback(null, result);
                }).catch((error:Error) => {
                    logger.warn('Error when processing GenTx: ' + error.message)
                    callback({
                        "code": -32000,
                        "message": error.message
                    });
                });
            },
        });

        app.use(cors({methods: ['POST']}));
        app.use(jsonParser());
        app.use(server.middleware());
        logger.info('Start Listening on: ' + this.config.JRPC_PORT)
        app.listen(this.config.JRPC_PORT);
    }

}

const {
  JRPC_PORT,
  CHAIN_RPC,
  CHAIN_PERMISSION,
  CHAIN_ACCOUNT,
  CHAIN_PRIVATEKEY,
} = process.env


let service = new PasskeyService({
    JRPC_PORT,
    CHAIN_RPC,
    CHAIN_PERMISSION,
    CHAIN_ACCOUNT,
    CHAIN_PRIVATEKEY
})

async function main() {
    await service.init();
    await service.start();
}

main()