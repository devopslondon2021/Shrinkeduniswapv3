/* eslint-disable prefer-const */
import { Bundle, Pool, Tick, Token } from "../types/schema";
import { BigInt } from "@graphprotocol/graph-ts";
import {
  Burn as BurnEvent,
  Initialize,
  Mint as MintEvent,
  Swap as SwapEvent,
} from "../types/templates/Pool/Pool";
import { createTick } from "../utils/tick";
import { convertTokenToDecimal } from "../utils";
import { findEthPerToken, getEthPriceInUSD, sqrtPriceX96ToTokenPrices } from "../utils/pricing";

export function handleInitialize(event: Initialize): void {
  // update pool sqrt price and tick
  let pool = Pool.load(event.address.toHexString());

  if (!pool) {
    return
  }

  pool.sqrtPrice = event.params.sqrtPriceX96;
  pool.tick = BigInt.fromI32(event.params.tick);
  // update token prices
  // update token prices
  let token0 = Token.load(pool.token0)!
  let token1 = Token.load(pool.token1)!
  token0.derivedETH = findEthPerToken(token0 as Token)
  token1.derivedETH = findEthPerToken(token1 as Token)
  
  // update ETH price now that prices could have changed
  let bundle = Bundle.load('1')

  if (!bundle) {
    return
  }
  bundle.ethPriceUSD = getEthPriceInUSD()
  bundle.save();
  token0.save();
  token1.save();
  pool.save();
}

export function handleMint(event: MintEvent): void {
  let poolAddress = event.address.toHexString();
  let pool = Pool.load(poolAddress);

  if (!pool) {
    return
  }
  
  let token0 = Token.load(pool.token0);
  if (!token0) {
    return
  }
  let token1 = Token.load(pool.token1);
  if (!token1) {
    return
  }
  let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
  let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)
  pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0)
  pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1)

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
  if (!lowerTick) {
    return
  }
  let upperTick = Tick.load(upperTickId);
  if (!upperTick) {
    return
  }

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
  pool.totalValueLockedETH = pool.totalValueLockedToken0
    .times(token0.derivedETH)

  lowerTick.save();
  upperTick.save();
  token0.save();
  token1.save();
  pool.save();
}

export function handleBurn(event: BurnEvent): void {
  let poolAddress = event.address.toHexString();
  let pool = Pool.load(poolAddress);
  if (!pool) {
    return
  }

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
  if (!lowerTick) {
    return
  }
  let upperTick = Tick.load(upperTickId);
  if (!upperTick) {
    return
  }
  let amount = event.params.amount;
  lowerTick.liquidityGross = lowerTick.liquidityGross.minus(amount);
  lowerTick.liquidityNet = lowerTick.liquidityNet.minus(amount);
  upperTick.liquidityGross = upperTick.liquidityGross.minus(amount);
  upperTick.liquidityNet = upperTick.liquidityNet.plus(amount);

  let token0 = Token.load(pool.token0)
  if (!token0) {
    return
  }
  let token1 = Token.load(pool.token1)
  if (!token1) {
    return
  }
  let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
  let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)
  pool.totalValueLockedToken0 = pool.totalValueLockedToken0.minus(amount0)
  pool.totalValueLockedToken1 = pool.totalValueLockedToken1.minus(amount1)
  pool.totalValueLockedETH = pool.totalValueLockedToken0
    .times(token0.derivedETH)

  lowerTick.save();
  upperTick.save();
  token0.save();
  token1.save();
  pool.save();
}

export function handleSwap(event: SwapEvent): void {
  let pool = Pool.load(event.address.toHexString());

  if (!pool) {
    return
  }

  // Update the pool with the new active liquidity, price, and tick.
  pool.liquidity = event.params.liquidity;
  pool.tick = BigInt.fromI32(event.params.tick as i32);
  pool.sqrtPrice = event.params.sqrtPriceX96;

  let token0 = Token.load(pool.token0)
  if (!token0) {
    return
  }
  let token1 = Token.load(pool.token1)
  if (!token1) {
    return
  }

  // amounts - 0/1 are token deltas: can be positive or negative
  let amount0 = convertTokenToDecimal(event.params.amount0, token0.decimals)
  let amount1 = convertTokenToDecimal(event.params.amount1, token1.decimals)
  pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0)
  pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1)
  pool.totalValueLockedETH = pool.totalValueLockedToken0
    .times(token0.derivedETH)
    .plus(pool.totalValueLockedToken1.times(token1.derivedETH))

  // updated pool ratess
  let prices = sqrtPriceX96ToTokenPrices(pool.sqrtPrice, token0 as Token, token1 as Token)
  pool.token0Price = prices[0]
  pool.token1Price = prices[1]
  
  pool.save();
  token0.save();
  token1.save();
}
