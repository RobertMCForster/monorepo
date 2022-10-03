/* eslint-disable prefer-const */
import { Address, BigInt, Bytes, dataSource } from "@graphprotocol/graph-ts";

import {
  RouterLiquidityAdded,
  RouterLiquidityRemoved,
  RelayerAdded,
  RelayerRemoved,
  StableSwapAdded,
  XCalled,
  Executed,
  Reconciled,
  AssetAdded,
  RouterRemoved,
  RouterAdded,
  RouterOwnerAccepted,
  RouterOwnerProposed,
  RouterRecipientSet,
  MaxRoutersPerTransferUpdated,
} from "../../../generated/Connext/ConnextHandler";
import {
  NewConnector,
  Dispatch,
  AggregateRootsUpdated,
  MessageSent,
  MessageProcessed,
} from "../../../generated/SpokeConnector/SpokeConnector";
import {
  Asset,
  AssetBalance,
  Router,
  Relayer,
  StableSwap,
  OriginTransfer,
  DestinationTransfer,
  Setting,
  OriginMessage,
  AggregateRoot,
  RootMessageSent,
  RootMessageProcessed,
  ConnectorMeta,
} from "../../../generated/schema";

import { getChainId, getOrCreateAsset, getOrCreateAssetBalance } from "./helper";

const DEFAULT_MAX_ROUTERS_PER_TRANSFER = 5;

/// MARK - Routers
export function handleRouterAdded(event: RouterAdded): void {
    let routerId = event.params.router.toHex();
    let router = Router.load(routerId);
  
    if (router == null) {
      router = new Router(event.params.router.toHex());
      router.isActive = true;
      router.save();
    }
  
    let settingEntity = Setting.load("1");
    if (settingEntity == null) {
      settingEntity = new Setting("1");
      settingEntity.maxRoutersPerTransfer = BigInt.fromI32(DEFAULT_MAX_ROUTERS_PER_TRANSFER);
      settingEntity.caller = Address.zero();
      settingEntity.save();
    }
  }
  
  export function handleRouterRemoved(event: RouterRemoved): void {
    let routerId = event.params.router.toHex();
    let router = Router.load(routerId);
    if (!router) {
      router = new Router(routerId);
    }
    router.isActive = false;
    router.save();
  }
  
  export function handleRouterRecipientSet(event: RouterRecipientSet): void {
    let routerId = event.params.router.toHex();
    let router = Router.load(routerId);
    if (!router) {
      router = new Router(routerId);
      router.isActive = true;
    }
    router.recipient = event.params.newRecipient;
    router.save();
  }
  
  export function handleRouterOwnerProposed(event: RouterOwnerProposed): void {
    let routerId = event.params.router.toHex();
    let router = Router.load(routerId);
    if (!router) {
      router = new Router(routerId);
      router.isActive = true;
    }
    router.proposedOwner = event.params.newProposed;
    router.proposedTimestamp = event.block.timestamp;
    router.save();
  }
  
  export function handleRouterOwnerAccepted(event: RouterOwnerAccepted): void {
    let routerId = event.params.router.toHex();
    let router = Router.load(routerId);
    if (!router) {
      router = new Router(routerId);
      router.isActive = true;
    }
    router.owner = event.params.newOwner;
    router.proposedOwner = null;
    router.proposedTimestamp = null;
    router.save();
  }
  
  /**
   * Updates the subgraph records when LiquidityAdded events are emitted. Will create a Router record if it does not exist
   *
   * @param event - The contract event to update the subgraph record with
   */
  export function handleRouterLiquidityAdded(event: RouterLiquidityAdded): void {
    const assetBalance = getOrCreateAssetBalance(event.params.local, event.params.router);
  
    // add new amount
    assetBalance.amount = assetBalance.amount.plus(event.params.amount);
  
    // save
    assetBalance.save();
  }
  
  /**
   * Updates the subgraph records when LiquidityRemoved events are emitted.
   *
   * @param event - The contract event to update the subgraph record with
   */
  export function handleRouterLiquidityRemoved(event: RouterLiquidityRemoved): void {
    // ID is of the format ROUTER_ADDRESS-ASSET_ID
    const assetBalance = getOrCreateAssetBalance(event.params.local, event.params.router);
  
    // update amount
    assetBalance.amount = assetBalance.amount.minus(event.params.amount);
  
    // save
    assetBalance.save();
  }
  
  /**
   * Updates the max amounts of routers the token can be routed through
   */
  export function handleMaxRoutersPerTransferUpdated(event: MaxRoutersPerTransferUpdated): void {
    let settingEntity = Setting.load("1");
    if (settingEntity == null) {
      settingEntity = new Setting("1");
    }
  
    settingEntity.maxRoutersPerTransfer = event.params.maxRoutersPerTransfer;
    settingEntity.caller = event.params.caller;
    settingEntity.save();
  }