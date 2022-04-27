/* eslint-disable prefer-const */
import { Pool, Tick, Token } from "../types/schema";
import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import {
  Burn as BurnEvent,
  Initialize,
  Mint as MintEvent,
  Swap as SwapEvent,
} from "../types/templates/Pool/Pool";
import { createTick } from "../utils/tick";

export function handleInitialize(event: Initialize): void {
  // update pool sqrt price and tick
  let pool = Pool.load(event.address.toHexString());
  pool.sqrtPrice = event.params.sqrtPriceX96;
  pool.tick = BigInt.fromI32(event.params.tick);
  pool.save();
}

export function handleMint(event: MintEvent): void {
  let poolAddress = event.address.toHexString();
  let pool = Pool.load(poolAddress);

  let token0 = Token.load(pool.token0);
  let token1 = Token.load(pool.token1);
  if (
    pool.tick !== null &&
    BigInt.fromI32(event.params.tickLower).le(pool.tick as BigInt) &&
    BigInt.fromI32(event.params.tickUpper).gt(pool.tick as BigInt)
  ) {
    pool.liquidity = pool.liquidity.plus(event.params.amount);
  }

  // tick entities
  let lowerTickIdx = event.params.tickLower;
  let upperTickIdx = event.params.tickUpper;

  let lowerTickId =
    poolAddress + "#" + BigInt.fromI32(event.params.tickLower).toString();
  let upperTickId =
    poolAddress + "#" + BigInt.fromI32(event.params.tickUpper).toString();

  let lowerTick = Tick.load(lowerTickId);
  let upperTick = Tick.load(upperTickId);

  if (lowerTick === null) {
    lowerTick = createTick(lowerTickId, lowerTickIdx, pool.id, event);
  }

  if (upperTick === null) {
    upperTick = createTick(upperTickId, upperTickIdx, pool.id, event);
  }

  let amount = event.params.amount;
  lowerTick.liquidityGross = lowerTick.liquidityGross.plus(amount);
  lowerTick.liquidityNet = lowerTick.liquidityNet.plus(amount);
  upperTick.liquidityGross = upperTick.liquidityGross.plus(amount);
  upperTick.liquidityNet = upperTick.liquidityNet.minus(amount);

  token0.save();
  token1.save();
  pool.save();
}

export function handleBurn(event: BurnEvent): void {
  let poolAddress = event.address.toHexString();
  let pool = Pool.load(poolAddress);

  let token0 = Token.load(pool.token0);
  let token1 = Token.load(pool.token1);
  // Pools liquidity tracks the currently active liquidity given pools current tick.
  // We only want to update it on burn if the position being burnt includes the current tick.
  if (
    pool.tick !== null &&
    BigInt.fromI32(event.params.tickLower).le(pool.tick as BigInt) &&
    BigInt.fromI32(event.params.tickUpper).gt(pool.tick as BigInt)
  ) {
    pool.liquidity = pool.liquidity.minus(event.params.amount);
  }

  // tick entities
  let lowerTickId =
    poolAddress + "#" + BigInt.fromI32(event.params.tickLower).toString();
  let upperTickId =
    poolAddress + "#" + BigInt.fromI32(event.params.tickUpper).toString();
  let lowerTick = Tick.load(lowerTickId);
  let upperTick = Tick.load(upperTickId);
  let amount = event.params.amount;
  lowerTick.liquidityGross = lowerTick.liquidityGross.minus(amount);
  lowerTick.liquidityNet = lowerTick.liquidityNet.minus(amount);
  upperTick.liquidityGross = upperTick.liquidityGross.minus(amount);
  upperTick.liquidityNet = upperTick.liquidityNet.plus(amount);

  token0.save();
  token1.save();
  pool.save();
}

export function handleSwap(event: SwapEvent): void {
  let pool = Pool.load(event.address.toHexString());
  let token0 = Token.load(pool.token0);
  let token1 = Token.load(pool.token1);

  // Update the pool with the new active liquidity, price, and tick.
  pool.liquidity = event.params.liquidity;
  pool.tick = BigInt.fromI32(event.params.tick as i32);
  pool.sqrtPrice = event.params.sqrtPriceX96;

  pool.save();
  token0.save();
  token1.save();
}
