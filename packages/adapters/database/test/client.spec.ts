import { restore, reset } from "sinon";
import {
  expect,
  mkAddress,
  mkBytes32,
  mock,
  RouterBalance,
  XTransfer,
  XTransferStatus,
  convertToRouterBalance,
  XMessage,
  RootMessage,
} from "@connext/nxtp-utils";
import { Pool } from "pg";
import { utils } from "ethers";

import {
  getTransferByTransferId,
  getTransfersByStatus,
  saveTransfers,
  saveCheckPoint,
  saveRouterBalances,
  getTransfersWithOriginPending,
  getTransfersWithDestinationPending,
  getCheckPoint,
  saveMessages,
  saveSentRootMessages,
  saveProcessedRootMessages,
  getPendingMessages,
  getRootMessages,
} from "../src/client";

describe("Database client", () => {
  let pool: Pool;
  const batchSize = 10;

  beforeEach(() => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || "postgres://postgres:qwerty@localhost:5432/connext?sslmode=disable",
      idleTimeoutMillis: 3000,
      allowExitOnIdle: true,
    });
  });

  afterEach(async () => {
    await pool.query("DELETE FROM asset_balances CASCADE");
    await pool.query("DELETE FROM assets CASCADE");
    await pool.query("DELETE FROM transfers CASCADE");
    await pool.query("DELETE FROM messages CASCADE");
    await pool.query("DELETE FROM root_messages CASCADE");
    await pool.query("DELETE FROM routers CASCADE");
    await pool.query("DELETE FROM checkpoints CASCADE");

    restore();
    reset();
  });

  it("should handle undefined status", async () => {
    const statusTransfers = await getTransfersByStatus(undefined as any, 10, 0, "ASC", pool);
    expect(statusTransfers.length).equal(0);
  });

  it("should save single transfer", async () => {
    const xTransfer = mock.entity.xtransfer({ status: XTransferStatus.Executed });
    await saveTransfers([xTransfer], pool);
  });

  it("should save single transfer null destination", async () => {
    let xTransferLocal = mock.entity.xtransfer({ status: XTransferStatus.Executed });
    xTransferLocal.xparams.destinationDomain = null as any;
    await saveTransfers([xTransferLocal], pool);
  });

  it("should upsert single transfer", async () => {
    const xTransfer = mock.entity.xtransfer({ status: XTransferStatus.Executed });
    xTransfer.destination!.status = XTransferStatus.CompletedFast;
    await saveTransfers([xTransfer], pool);
    const dbTransfer = await getTransferByTransferId(xTransfer.transferId, pool);
    expect(dbTransfer!.destination!.status).equal(XTransferStatus.CompletedFast);
    expect(dbTransfer!.transferId).equal(xTransfer.transferId);
  });

  it("should upsert origin and then destination side transfer", async () => {
    const xTransfer = mock.entity.xtransfer({ status: XTransferStatus.XCalled });
    const xcall_timestamp = xTransfer.origin!.xcall.timestamp;
    xTransfer.destination = undefined;
    const origin = xTransfer.origin;
    await saveTransfers([xTransfer], pool);
    const xTransferDestination = mock.entity.xtransfer({ status: XTransferStatus.CompletedFast });
    xTransfer.destination = xTransferDestination.destination;
    xTransfer.origin = undefined;
    const reconcile_timestamp = xTransfer.destination!.reconcile!.timestamp;
    await saveTransfers([xTransfer], pool);
    const dbTransfer = await getTransferByTransferId(xTransfer.transferId, pool);
    expect(dbTransfer!.destination!.status).equal(XTransferStatus.CompletedFast);
    expect(dbTransfer!.origin?.xcall.timestamp).equal(xcall_timestamp);
    expect(dbTransfer?.destination?.reconcile?.timestamp).deep.equal(reconcile_timestamp);
    expect(dbTransfer!.transferId).equal(xTransfer.transferId);
    expect(dbTransfer?.origin).deep.equal(origin);
  });

  it("should upsert destination and then origin side transfer", async () => {
    const xTransfer = mock.entity.xtransfer({ status: XTransferStatus.CompletedFast });
    const origin = xTransfer.origin;
    xTransfer.origin = undefined;
    const reconcile_timestamp = xTransfer.destination!.reconcile!.timestamp;
    await saveTransfers([xTransfer], pool);
    xTransfer.origin = origin;
    xTransfer.destination = undefined;
    const xcall_timestamp = xTransfer.origin!.xcall.timestamp;
    await saveTransfers([xTransfer], pool);
    const dbTransfer = await getTransferByTransferId(xTransfer.transferId, pool);
    expect(dbTransfer!.destination!.status).equal(XTransferStatus.CompletedFast);
    expect(dbTransfer!.origin?.xcall.timestamp).equal(xcall_timestamp);
    expect(dbTransfer?.destination?.reconcile?.timestamp).deep.equal(reconcile_timestamp);
    expect(dbTransfer!.transferId).equal(xTransfer.transferId);
    expect(dbTransfer?.origin).deep.equal(origin);
  });

  it("should save multiple transfers", async () => {
    const transfers: XTransfer[] = [];
    for (var _i = 0; _i < batchSize; _i++) {
      transfers.push(mock.entity.xtransfer({ status: XTransferStatus.Executed }));
    }
    await saveTransfers(transfers, pool);
  });

  it("should upsert multiple transfers", async () => {
    const transfers: XTransfer[] = [];
    for (let transfer of transfers) {
      transfer!.destination!.status = XTransferStatus.CompletedSlow;
    }
    await saveTransfers(transfers, pool);
    for (let transfer of transfers) {
      const dbTransfer = await getTransferByTransferId(transfer.transferId, pool);
      expect(dbTransfer!.destination!.status).equal(XTransferStatus.CompletedSlow);
      expect(dbTransfer!.transferId).equal(transfer.transferId);
    }
  });

  it("should get transfer by status", async () => {
    const xTransfer = mock.entity.xtransfer({ status: XTransferStatus.CompletedFast });
    await saveTransfers([xTransfer], pool);

    const statusTransfers = await getTransfersByStatus(XTransferStatus.CompletedFast, 10, 0, "ASC", pool);
    expect(statusTransfers.length).greaterThan(0);
    expect(statusTransfers[0]!.destination!.status).equal(xTransfer.destination!.status);
  });

  it("should get transfer by status with limit and ascending order", async () => {
    const transfers = Array(10)
      .fill(0)
      .map((_a, index) => {
        const t: XTransfer = mock.entity.xtransfer({ status: XTransferStatus.Executed });
        t.xparams.nonce = index + 1;
        t.origin!.xcall.timestamp = index + 1;
        return t;
      });
    await saveTransfers(transfers, pool);
    const set1 = await getTransfersByStatus(XTransferStatus.Executed, 4, 0, "ASC", pool);
    expect(set1[0].xparams.nonce).to.eq(1);
  });

  it("should get transfer by status with limit and descending order", async () => {
    const transfers = Array(10)
      .fill(0)
      .map((_a, index) => {
        const t: XTransfer = mock.entity.xtransfer({ status: XTransferStatus.Executed });
        t.xparams.nonce = index + 1;
        t.origin!.xcall.timestamp = index + 1;
        return t;
      });
    await saveTransfers(transfers, pool);
    const set1 = await getTransfersByStatus(XTransferStatus.Executed, 4, 0, "DESC", pool);
    expect(set1[0].xparams.nonce).to.eq(10);
  });

  it("should get transfer by status with limit", async () => {
    const transfers = Array(10)
      .fill(0)
      .map((_a, index) => {
        const t: XTransfer = mock.entity.xtransfer({ status: XTransferStatus.Executed });
        t.xparams.nonce = index + 1;
        t.origin!.xcall.timestamp = index + 1;
        return t;
      });
    await saveTransfers(transfers, pool);
    const set1 = await getTransfersByStatus(XTransferStatus.Executed, 4, 0, "DESC", pool);
    expect(set1.length).to.eq(4);
  });

  it("should get transfer by status with limit from offset", async () => {
    const transfers = Array(10)
      .fill(0)
      .map((_a, index) => {
        const t: XTransfer = mock.entity.xtransfer({ status: XTransferStatus.Executed });
        t.xparams.nonce = index + 1;
        t.origin!.xcall.timestamp = index + 1;
        return t;
      });
    await saveTransfers(transfers, pool);
    const set1 = await getTransfersByStatus(XTransferStatus.Executed, 1, 9, "DESC", pool);
    expect(set1.length).to.eq(1);
    expect(set1[0].xparams.nonce).to.eq(1);
  });

  it("should save valid boolean fields", async () => {
    let xTransferLocal = mock.entity.xtransfer();
    xTransferLocal.xparams.receiveLocal = true;
    await saveTransfers([xTransferLocal], pool);
    const dbTransfer = await getTransferByTransferId(xTransferLocal.transferId, pool);
    expect(dbTransfer!.transferId).equal(xTransferLocal.transferId);
    expect(dbTransfer!.xparams!.receiveLocal).equal(true);
  });

  it("should save missing boolean fields with defaults", async () => {
    const xTransferLocal = mock.entity.xtransfer();
    await saveTransfers([xTransferLocal], pool);
    const dbTransfer = await getTransferByTransferId(xTransferLocal.transferId, pool);
    expect(dbTransfer!.transferId).equal(xTransferLocal.transferId);
    expect(dbTransfer!.xparams!.receiveLocal).equal(false);
  });

  it("should set a router balance", async () => {
    const routerBalances: RouterBalance[] = [
      {
        router: mkAddress("0xa"),
        assets: [
          {
            canonicalId: mkBytes32("0xb"),
            adoptedAsset: mkAddress("0xaa"),
            blockNumber: "0",
            domain: "1234",
            id: mkAddress("0xbb"),
            canonicalDomain: "1111",
            key: mkBytes32("0xb"),
            localAsset: mkAddress("0xaa"),
            balance: utils.parseEther("100").toString(),
          },
          {
            canonicalId: mkBytes32("0xbb"),
            adoptedAsset: mkAddress("0xaa"),
            blockNumber: "0",
            domain: "1234",
            id: mkAddress("0xbb"),
            canonicalDomain: "1111",
            key: mkBytes32("0xb"),
            localAsset: mkAddress("0xaa"),
            balance: utils.parseEther("99").toString(),
          },
          {
            canonicalId: mkBytes32("0xb"),
            adoptedAsset: mkAddress("0xaa"),
            blockNumber: "0",
            domain: "12345",
            id: mkAddress("0xbb"),
            canonicalDomain: "1111",
            key: mkBytes32("0xb"),
            localAsset: mkAddress("0xaa"),
            balance: utils.parseEther("98").toString(),
          },
          {
            canonicalId: mkBytes32("0xbb"),
            adoptedAsset: mkAddress("0xaa"),
            blockNumber: "0",
            domain: "12345",
            id: mkAddress("0xbb"),
            canonicalDomain: "1111",
            key: mkBytes32("0xb"),
            localAsset: mkAddress("0xaa"),
            balance: utils.parseEther("97").toString(),
          },
        ],
      },
      {
        router: mkAddress("0xb"),
        assets: [
          {
            canonicalId: mkBytes32("0xb"),
            adoptedAsset: mkAddress("0xaa"),
            blockNumber: "0",
            domain: "1234",
            id: mkAddress("0xbb"),
            canonicalDomain: "1111",
            key: mkBytes32("0xb"),
            localAsset: mkAddress("0xaa"),
            balance: utils.parseEther("100").toString(),
          },
          {
            canonicalId: mkBytes32("0xbb"),
            adoptedAsset: mkAddress("0xaa"),
            blockNumber: "0",
            domain: "1234",
            id: mkAddress("0xbb"),
            canonicalDomain: "1111",
            key: mkBytes32("0xb"),
            localAsset: mkAddress("0xaa"),
            balance: utils.parseEther("99").toString(),
          },
          {
            canonicalId: mkBytes32("0xb"),
            adoptedAsset: mkAddress("0xaa"),
            blockNumber: "0",
            domain: "12345",
            id: mkAddress("0xbb"),
            canonicalDomain: "1111",
            key: mkBytes32("0xb"),
            localAsset: mkAddress("0xaa"),
            balance: utils.parseEther("98").toString(),
          },
          {
            canonicalId: mkBytes32("0xbb"),
            adoptedAsset: mkAddress("0xaa"),
            blockNumber: "0",
            domain: "12345",
            id: mkAddress("0xbb"),
            canonicalDomain: "1111",
            key: mkBytes32("0xb"),
            localAsset: mkAddress("0xaa"),
            balance: utils.parseEther("97").toString(),
          },
        ],
      },
    ];
    await saveRouterBalances(routerBalances, pool);
    const res = await pool.query(`SELECT * FROM routers_with_balances order by address, domain, canonical_id`);
    const rb = convertToRouterBalance(res.rows);
    expect(rb).to.deep.eq(routerBalances);
  });

  it("should router balance when no data", async () => {
    const routerBalances: RouterBalance[] = [];
    await saveRouterBalances(routerBalances, pool);
    const res = await pool.query(`SELECT * FROM routers_with_balances`);
    const rb = convertToRouterBalance(res.rows);
    expect(rb).to.deep.eq(routerBalances);
  });

  it("should set and get checkpoint", async () => {
    const nonce = 8239764;
    const name = "nonce_checkpoint";
    await saveCheckPoint(name, nonce, pool);
    const result = await getCheckPoint(name, pool);
    expect(result).equal(nonce);
  });

  it("should get transfers missing origin data", async () => {
    const xTransfer1: XTransfer = mock.entity.xtransfer({ status: XTransferStatus.Executed });
    xTransfer1.destination!.execute!.timestamp = 1;
    const xTransfer2: XTransfer = mock.entity.xtransfer({ status: XTransferStatus.Executed });
    xTransfer2.destination!.execute!.timestamp = 2;
    const xTransfer3 = mock.entity.xtransfer({ status: XTransferStatus.Reconciled });
    xTransfer3.origin = undefined;
    const xTransfer3Id = xTransfer3.transferId;
    await saveTransfers([xTransfer3], pool);
    const xTransfer4: XTransfer = mock.entity.xtransfer({ status: XTransferStatus.Executed });
    xTransfer4.destination!.execute!.timestamp = 4;
    await saveTransfers([xTransfer1, xTransfer2, xTransfer3], pool);
    const transfers = await getTransfersWithOriginPending(xTransfer3.xparams.originDomain, 100, "ASC", pool);
    expect(transfers.length).greaterThan(0);
    expect(transfers).includes(xTransfer3Id);
  });

  it("should get transfers missing destination data", async () => {
    const xTransfer1: XTransfer = mock.entity.xtransfer({ status: XTransferStatus.Executed });
    xTransfer1.destination!.execute!.timestamp = 1;
    const xTransfer2: XTransfer = mock.entity.xtransfer({ status: XTransferStatus.Executed });
    xTransfer2.destination!.execute!.timestamp = 2;
    const xTransfer3 = mock.entity.xtransfer({ status: XTransferStatus.XCalled });
    xTransfer3.destination = undefined;
    const xTransfer3Id = xTransfer3.transferId;
    await saveTransfers([xTransfer3], pool);
    const xTransfer4: XTransfer = mock.entity.xtransfer({ status: XTransferStatus.Executed });
    xTransfer4.destination!.execute!.timestamp = 4;
    await saveTransfers([xTransfer1, xTransfer2, xTransfer3], pool);
    const transfers = await getTransfersWithDestinationPending(xTransfer3.xparams.destinationDomain, 100, "ASC", pool);
    expect(transfers.length).greaterThan(0);
    expect(transfers).includes(xTransfer3Id);
  });

  it("should get checkpoint when no data", async () => {
    const timestamp = await getCheckPoint(undefined as any, pool);
    expect(timestamp).equal(0);
  });

  it("should get pending origin transfers when no data", async () => {
    const xTransfer1: XTransfer = mock.entity.xtransfer({ status: XTransferStatus.XCalled });
    const transfers = await getTransfersWithOriginPending(xTransfer1.xparams!.originDomain, 100, undefined, pool);
    expect(transfers.length).equal(0);
  });

  it("should get destination transfers when no data", async () => {
    const xTransfer1: XTransfer = mock.entity.xtransfer({ status: XTransferStatus.Reconciled });
    const transfers = await getTransfersWithDestinationPending(
      xTransfer1.xparams!.destinationDomain,
      100,
      undefined,
      pool,
    );
    expect(transfers.length).equal(0);
  });

  it("should save multiple messages", async () => {
    const messages: XMessage[] = [];
    for (var _i = 0; _i < batchSize; _i++) {
      messages.push(mock.entity.xMessage());
    }
    await saveMessages(messages, pool);
  });

  it("should upsert multiple messages", async () => {
    const messages: XMessage[] = [];
    for (var _i = 0; _i < batchSize; _i++) {
      messages.push(mock.entity.xMessage());
    }
    await saveMessages(messages, pool);
    for (let message of messages) {
      message.destination!.processed = true;
    }
    await saveMessages(messages, pool);
    const pendingMessages = await getPendingMessages(pool);
    for (const message of pendingMessages) {
      expect(message.destination!.processed).equal(true);
    }
  });

  it("should save multiple sent root messages", async () => {
    const messages: RootMessage[] = [];
    for (let _i = 0; _i < batchSize; _i++) {
      messages.push(mock.entity.rootMessage());
    }
    await saveSentRootMessages(messages, pool);
    const _messages = await getRootMessages(undefined, 100, "ASC", pool);
    expect(_messages).to.deep.eq(messages);
  });

  it("should upsert multiple processed messages on top of sent messages and set processed = true", async () => {
    const messages: RootMessage[] = [];
    for (let _i = 0; _i < batchSize; _i++) {
      messages.push(mock.entity.rootMessage());
    }

    // processed should overwrite and set processed true
    await saveSentRootMessages(messages, pool);
    await saveProcessedRootMessages(messages, pool);

    const _messages = await getRootMessages(undefined, 100, "ASC", pool);
    expect(_messages).to.deep.eq(
      messages.map((m) => {
        return { ...m, processed: true };
      }),
    );
  });

  it("should not set processed to false", async () => {
    const messages: RootMessage[] = [];
    for (let _i = 0; _i < batchSize; _i++) {
      messages.push(mock.entity.rootMessage());
    }

    // sent should not overwrite to processed = false
    await saveProcessedRootMessages(messages, pool);
    await saveSentRootMessages(messages, pool);

    const _messages = await getRootMessages(undefined, 100, "ASC", pool);
    expect(_messages).to.deep.eq(
      messages.map((m) => {
        return { ...m, processed: true };
      }),
    );
  });

  it("should filter processed properly", async () => {
    const messages: RootMessage[] = [];
    for (let _i = 0; _i < batchSize; _i++) {
      messages.push(mock.entity.rootMessage());
    }
    await saveSentRootMessages(messages, pool);
    // process first half of batch
    await saveProcessedRootMessages(messages.slice(0, batchSize / 2 - 1), pool);

    let _messages = await getRootMessages(true, 100, "ASC", pool);
    expect(_messages).to.deep.eq(messages.slice(0, batchSize / 2 - 1).map((m) => ({ ...m, processed: true })));

    _messages = await getRootMessages(false, 100, "ASC", pool);
    expect(_messages).to.deep.eq(messages.slice(batchSize / 2 - 1));

    _messages = await getRootMessages(undefined, 100, "ASC", pool);
    expect(_messages).to.deep.eq(
      messages
        .slice(0, batchSize / 2 - 1)
        .map((m) => ({ ...m, processed: true }))
        .concat(messages.slice(batchSize / 2 - 1).map((m) => ({ ...m, processed: false }))),
    );
  });

  it("should upsert multiple processed messages", async () => {
    const messages: RootMessage[] = [];
    for (var _i = 0; _i < batchSize; _i++) {
      messages.push(mock.entity.rootMessage());
    }
    await saveProcessedRootMessages(messages, pool);

    for (let message of messages) {
      message.root = "0xroot";
    }
    await saveSentRootMessages(messages, pool);
  });

  it("should get sent root message", async () => {});

  it("should throw errors", async () => {
    await expect(getTransferByTransferId("")).to.eventually.not.be.rejected;
    await expect(getTransfersByStatus(undefined as any, undefined as any)).to.eventually.not.be.rejected;
    await expect(saveTransfers(undefined as any)).to.eventually.not.be.rejected;
    await expect(saveMessages(undefined as any)).to.eventually.not.be.rejected;
    await expect(saveSentRootMessages(undefined as any)).to.eventually.not.be.rejected;
    await expect(saveProcessedRootMessages(undefined as any)).to.eventually.not.be.rejected;
    await expect(getPendingMessages(undefined as any, undefined as any)).to.eventually.not.be.rejected;
    await expect(saveRouterBalances([])).to.eventually.not.be.rejected;
    await expect(getTransfersWithDestinationPending(undefined as any, undefined as any)).to.eventually.not.be.rejected;
    await expect(getTransfersWithOriginPending(undefined as any, undefined as any)).to.eventually.not.be.rejected;
    await expect(getCheckPoint(undefined as any, undefined as any)).to.eventually.not.be.rejected;
    await expect(saveCheckPoint(undefined as any, undefined as any, undefined as any)).to.eventually.not.be.rejected;
  });
});