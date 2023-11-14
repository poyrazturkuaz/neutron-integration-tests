import {
  CosmosWrapper,
  getEventAttributesFromTx,
  NEUTRON_DENOM,
  WalletWrapper,
} from '../../helpers/cosmos';
import { TestStateLocalCosmosTestNet } from '../common_localcosmosnet';
import { NeutronContract } from '../../helpers/types';
import { CodeId } from '../../types';
import {
  AllLimitOrderTrancheUserResponse,
  LimitOrderTrancheUserResponse,
  LimitOrderType,
  ParamsResponse,
} from '../../helpers/dex';

describe('Neutron / IBC hooks', () => {
  let testState: TestStateLocalCosmosTestNet;
  let neutronChain: CosmosWrapper;
  let neutronAccount: WalletWrapper;
  let contractAddress: string;
  let trancheKey: string;

  beforeAll(async () => {
    testState = new TestStateLocalCosmosTestNet();
    await testState.init();
    neutronChain = new CosmosWrapper(
      testState.sdk1,
      testState.blockWaiter1,
      NEUTRON_DENOM,
    );
    neutronAccount = new WalletWrapper(
      neutronChain,
      testState.wallets.neutron.demo1,
    );
  });

  describe('Instantiate hooks ibc transfer contract', () => {
    let codeId: CodeId;
    test('store contract', async () => {
      codeId = await neutronAccount.storeWasm(NeutronContract.DEX_DEV);
      expect(codeId).toBeGreaterThan(0);
    });
    test('instantiate contract', async () => {
      contractAddress = (
        await neutronAccount.instantiateContract(codeId, '{}', 'dex_dev')
      )[0]._contract_address;
      console.log(contractAddress);

      await neutronAccount.msgSend(contractAddress, {
        amount: '100000000',
        denom: 'untrn',
      });
      await neutronAccount.msgSend(contractAddress, {
        amount: '100000000',
        denom: 'uibcusdc',
      });
    });
  });

  describe('DEX messages', () => {
    describe('Deposit', () => {
      test('Invalid pair', async () => {
        await expect(
          neutronAccount.executeContract(
            contractAddress,
            JSON.stringify({
              deposit: {
                receiver: contractAddress,
                token_a: 'untrn',
                token_b: 'untrn',
                amounts_a: ['100'], // uint128
                amounts_b: ['100'], // uint128
                tick_indexes_a_to_b: [1], // i64
                fees: [0], // u64
                options: [
                  {
                    disable_swap: true,
                  },
                ],
              },
            }),
          ),
        ).rejects.toThrowError(
          /failed to execute \*types.MsgDeposit: untrn<>untrn: Invalid token pair/,
        );
      });
      test('Valid pair', async () => {
        // pool denom - 'neutron/pool/0'
        const res = await neutronAccount.executeContract(
          contractAddress,
          JSON.stringify({
            deposit: {
              receiver: contractAddress,
              token_a: 'untrn',
              token_b: 'uibcusdc',
              amounts_a: ['100'], // uint128
              amounts_b: ['100'], // uint128
              tick_indexes_a_to_b: [1], // i64
              fees: [0], // u64
              options: [
                {
                  disable_swap: true,
                },
              ],
            },
          }),
        );
        expect(res.code).toEqual(0);
      });
    });
    describe('Withdrawal', () => {
      test('valid', async () => {
        // pool denom - 'neutron/pool/0'
        const res = await neutronAccount.executeContract(
          contractAddress,
          JSON.stringify({
            withdrawal: {
              receiver: contractAddress,
              token_a: 'untrn',
              token_b: 'uibcusdc',
              shares_to_remove: ['10'], // uint128
              tick_indexes_a_to_b: [1], // i64
              fees: [0], // u64
            },
          }),
        );
        expect(res.code).toEqual(0);
      });
    });
    describe('LimitOrder', () => {
      // enum LimitOrderType{
      //   GOOD_TIL_CANCELLED = 0;
      //   FILL_OR_KILL = 1;
      //   IMMEDIATE_OR_CANCEL = 2;
      //   JUST_IN_TIME = 3;
      //   GOOD_TIL_TIME = 4;
      // }
      test('GOOD_TIL_CANCELLED', async () => {
        const res = await neutronAccount.executeContract(
          contractAddress,
          JSON.stringify({
            place_limit_order: {
              receiver: contractAddress,
              token_in: 'untrn',
              token_out: 'uibcusdc',
              tick_index_in_to_out: 1,
              amount_in: '10',
              order_type: LimitOrderType.GoodTilCanceled,
            },
          }),
        );
        expect(res.code).toEqual(0);
      });
      test('FILL_OR_KILL', async () => {
        const res = await neutronAccount.executeContract(
          contractAddress,
          JSON.stringify({
            place_limit_order: {
              receiver: contractAddress,
              token_in: 'untrn',
              token_out: 'uibcusdc',
              tick_index_in_to_out: 1,
              amount_in: '10',
              order_type: LimitOrderType.FillOrKill,
              max_amount_out: '100',
            },
          }),
        );
        expect(res.code).toEqual(0);
      });
      test('IMMEDIATE_OR_CANCEL', async () => {
        const res = await neutronAccount.executeContract(
          contractAddress,
          JSON.stringify({
            place_limit_order: {
              receiver: contractAddress,
              token_in: 'untrn',
              token_out: 'uibcusdc',
              tick_index_in_to_out: 1,
              amount_in: '10',
              order_type: LimitOrderType.ImmediateOrCancel,
              max_amount_out: '100',
            },
          }),
        );
        expect(res.code).toEqual(0);
      });
      test('JUST_IN_TIME', async () => {
        const res = await neutronAccount.executeContract(
          contractAddress,
          JSON.stringify({
            place_limit_order: {
              receiver: contractAddress,
              token_in: 'untrn',
              token_out: 'uibcusdc',
              tick_index_in_to_out: 1,
              amount_in: '10',
              order_type: LimitOrderType.JustInTime,
            },
          }),
        );
        expect(res.code).toEqual(0);
        trancheKey = getEventAttributesFromTx(
          { tx_response: res },
          'TickUpdate',
          ['TrancheKey'],
        )[0]['TrancheKey'];
      });
      test('GOOD_TIL_TIME', async () => {
        const res = await neutronAccount.executeContract(
          contractAddress,
          JSON.stringify({
            place_limit_order: {
              receiver: contractAddress,
              token_in: 'untrn',
              token_out: 'uibcusdc',
              tick_index_in_to_out: 1,
              amount_in: '10',
              expiration_time: Math.ceil(Date.now() / 1000) + 1000,
              order_type: LimitOrderType.GoodTilTime,
            },
          }),
        );
        expect(res.code).toEqual(0);
      });
      test('GOOD_TIL_TIME expired', async () => {
        await expect(
          neutronAccount.executeContract(
            contractAddress,
            JSON.stringify({
              place_limit_order: {
                receiver: contractAddress,
                token_in: 'untrn',
                token_out: 'uibcusdc',
                tick_index_in_to_out: 1,
                amount_in: '10',
                expiration_time: 1,
                order_type: LimitOrderType.GoodTilTime,
              },
            }),
          ),
        ).rejects.toThrowError(
          /Limit order expiration time must be greater than current block time/,
        );
      });
      test('unknown order type', async () => {
        await expect(
          neutronAccount.executeContract(
            contractAddress,
            JSON.stringify({
              place_limit_order: {
                receiver: contractAddress,
                token_in: 'untrn',
                token_out: 'uibcusdc',
                tick_index_in_to_out: 1,
                amount_in: '10',
                expiration_time: 1,
                order_type: 10,
              },
            }),
          ),
        ).rejects.toThrowError(
          /invalid value: 10, expected one of: 0, 1, 2, 3, 4/,
        );
      });
    });
    describe('Withdraw filled lo', () => {
      console.log(trancheKey);
      test('Withdraw', async () => {
        const res = await neutronAccount.executeContract(
          contractAddress,
          JSON.stringify({
            withdraw_filled_limit_order: {
              tranche_key: trancheKey,
            },
          }),
        );
        expect(res.code).toEqual(0);
      });
    });
    describe('cancel lo', () => {
      console.log(trancheKey);
      test('cancel failed', async () => {
        await expect(
          neutronAccount.executeContract(
            contractAddress,
            JSON.stringify({
              cancel_limit_order: {
                tranche_key: trancheKey,
              },
            }),
          ),
        ).rejects.toThrowError(
          /No active limit found. It does not exist or has already been filled/,
        );
      });
    });

    describe('MultiHopSwap', () => {
      // TBD
      // console.log(trancheKey);
      // test('MultiHopSwap', async () => {
      //   await expect(
      //     neutronAccount.executeContract(
      //       contractAddress,
      //       JSON.stringify({
      //         cancel_limit_order: {
      //           tranche_key: trancheKey,
      //         },
      //       }),
      //     ),
      //   ).rejects.toThrowError(
      //     /No active limit found. It does not exist or has already been filled/,
      //   );
      // });
    });
  });
  describe('DEX queries', () => {
    test('ParamsQuery', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('LimitOrderTrancheUserQuery', async () => {
      const res =
        await neutronAccount.chain.queryContract<LimitOrderTrancheUserResponse>(
          contractAddress,
          {
            limit_order_tranche_user: {
              address: contractAddress,
              tranche_key: trancheKey,
            },
          },
        );
      expect(res.limit_order_tranche_user).toBeDefined();
    });
    test('LimitOrderTrancheUserAllQuery', async () => {
      const res =
        await neutronAccount.chain.queryContract<AllLimitOrderTrancheUserResponse>(
          contractAddress,
          {
            limit_order_tranche_user_all: {},
          },
        );
      expect(res.limit_order_tranche_user.length).toBeGreaterThan(0);
    });
    test('LimitOrderTrancheUserAllByAddressQuery', async () => {
      const res =
        await neutronAccount.chain.queryContract<AllLimitOrderTrancheUserResponse>(
          contractAddress,
          {
            limit_order_tranche_user_all_by_address: {
              address: contractAddress,
            },
          },
        );
      expect(res.limit_order_tranche_user).toBeGreaterThan(0);
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
    test('Params', async () => {
      await neutronAccount.chain.queryContract<ParamsResponse>(
        contractAddress,
        {
          params: {},
        },
      );
    });
  });
});
