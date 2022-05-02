import { PoolCreated } from "../types/Factory/Factory";
import { Bundle, Pool, Token } from "../types/schema";
import { Pool as PoolTemplate } from "../types/templates";
import { ZERO_BI } from "./../utils/constants";
import { log, BigInt } from "@graphprotocol/graph-ts";
import {
  fetchTokenSymbol,
  fetchTokenName,
  fetchTokenDecimals,
} from "../utils/token";
import * as constants from '../utils/constants'

export function handlePoolCreated(event: PoolCreated): void {
  let pool = new Pool(event.params.pool.toHexString()) as Pool;
  let token0 = Token.load(event.params.token0.toHexString());
  let token1 = Token.load(event.params.token1.toHexString());

  // fetch info if null
  if (token0 === null) {
    token0 = new Token(event.params.token0.toHexString());
    token0.symbol = fetchTokenSymbol(event.params.token0);
    token0.name = fetchTokenName(event.params.token0);
    let decimals = fetchTokenDecimals(event.params.token0);

    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.debug("mybug the decimal on token 0 was null", []);
      return;
    }

    token0.decimals = decimals;
  }

  if (token1 === null) {
    token1 = new Token(event.params.token1.toHexString());
    token1.symbol = fetchTokenSymbol(event.params.token1);
    token1.name = fetchTokenName(event.params.token1);
    let decimals = fetchTokenDecimals(event.params.token1);
    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.debug("mybug the decimal on token 0 was null", []);
      return;
    }
    token1.decimals = decimals;
  }

  pool.token0 = token0.id;
  pool.token1 = token1.id;
  pool.feeTier = BigInt.fromI32(event.params.fee);
  pool.liquidity = ZERO_BI;
  pool.sqrtPrice = ZERO_BI;

  // create new bundle for tracking eth price
  let bundle = new Bundle('1')
  bundle.ethPriceUSD = constants.ZERO_BD
  bundle.save()

  pool.save();
  // create the tracked contract based on the template
  PoolTemplate.create(event.params.pool);
  token0.save();
  token1.save();
}
