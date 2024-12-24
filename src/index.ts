 import Decimal from 'decimal.js';

 const ANTI_ADDRESS = "HB8KrN7Bb3iLWUPsozp67kS4gxtbA4W5QJX4wKPvpump";
 const PRO_ADDRESS = "CWFa2nxUMf5d1WwKtG9FS9kjUKGwKXWSjH8hFdWspump";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname } = new URL(request.url);

		switch (pathname) {
			case "/api/price/history/anti":
				return getHistory(env, ANTI_ADDRESS);
			case "/api/price/history/pro":
				return getHistory(env, PRO_ADDRESS);
			case "/api/price/anti":
				return getPrice(env, ANTI_ADDRESS);
			case "/api/price/pro":
				return getPrice(env, PRO_ADDRESS);
			case "/api/price/hourly/anti":
				return getHourlyPrices(env, ANTI_ADDRESS);
			case "/api/price/hourly/pro":
				return getHourlyPrices(env, PRO_ADDRESS);
			case "/api/price/daily/anti":
				return getDailyPrices(env, ANTI_ADDRESS);
			case "/api/price/daily/pro":
				return getDailyPrices(env, PRO_ADDRESS);
			case "/api/mcap/anti":
				return getMarketCap(env, ANTI_ADDRESS);
			case "/api/mcap/pro":
				return getMarketCap(env, ANTI_ADDRESS);
			case "/api/mcap/history/anti":
				return getMarketCapHistory(env, ANTI_ADDRESS);
			case "/api/mcap/history/pro":
				return getMarketCapHistory(env, PRO_ADDRESS);
			case "/api/mcap/daily/anti":
				return getDailyMarketCaps(env, ANTI_ADDRESS);
			case "/api/mcap/daily/pro":
				return getDailyMarketCaps(env, PRO_ADDRESS);
			default:
				return Response.json({error: "Invalid request"}, {
				status: 404,
			});
		}
	},

	async scheduled(event, env, ctx) {
		const cronExpression = event.cron;

		try {
			if (cronExpression == "* * * * *") {
				await indexPrices(env);
			} else if (cronExpression == "0 * * * *") {
				await indexMarketCap(env);
				await indexHourlyAveragePrice(env);
			} else if (cronExpression == "0 0 * * *") {
				await indexDailyAveragePrice(env);
				await indexDailyAverageMarketCap(env);
			}
		} catch (error) {
			console.error(`Error handling CRON ${cronExpression}:`, error);
		}
	}
} satisfies ExportedHandler<Env>;

async function indexPrices(env: Env) : Promise<void> {
	const prices : any = await getPrices(env);
	try {
		await env.DB.prepare("INSERT INTO prices(source, address, price) VALUES ('raydium', ?, ?), ('raydium', ?, ?)")
			.bind(ANTI_ADDRESS, prices.antiPrice, PRO_ADDRESS, prices.proPrice)
			.run();
	} catch (error) {
		console.error(error);
	}
}

async function indexMarketCap(env: Env) : Promise<void> {
	const prices : any = await getPrices(env);
	const mints = [ANTI_ADDRESS, PRO_ADDRESS];
	const supplies = await getTokenSupplies(mints);
	const marketCapAnti : Decimal = new Decimal(prices.antiPrice).times(supplies[0]);
	const marketCapPro : Decimal = new Decimal(prices.proPrice).times(supplies[1]);

	try {
		await env.DB.prepare("INSERT INTO market_caps(source, address, market_cap) VALUES ('raydium', ?, ?), ('raydium', ?, ?)")
			.bind(ANTI_ADDRESS, marketCapAnti.toString(), PRO_ADDRESS, marketCapPro.toString())
			.run();
	} catch (error) {
		console.error(error);
	}
}

async function indexHourlyAveragePrice(env: Env) : Promise<void> {
	const query = `
	WITH avg_prices AS (
		SELECT address, AVG(price) AS average_price
		FROM prices
		WHERE timestamp >= datetime('now', '-1 hour')
		GROUP BY address
	)
	INSERT INTO hourly_prices (address, price)
	SELECT address, average_price
	FROM avg_prices;
	`
	try {
		await env.DB.prepare(query).run();
	} catch (error) {
		console.error(error);
	}
}

async function indexDailyAveragePrice(env: Env) : Promise<void> {
	const query = `
	WITH avg_prices AS (
		SELECT address, AVG(price) AS average_price
		FROM prices
		WHERE timestamp >= datetime('now', '-1 day')
		GROUP BY address
	)
	INSERT INTO daily_prices (address, price)
	SELECT address, average_price
	FROM avg_prices;
	`
	try {
		await env.DB.prepare(query).run();
	} catch (error) {
		console.error(error);
	}
}

async function indexDailyAverageMarketCap(env: Env) : Promise<void> {
	const query = `
	WITH avg_market_caps AS (
		SELECT address, AVG(market_cap) AS average_market_cap
		FROM market_caps
		WHERE timestamp >= datetime('now', '-1 day')
		GROUP BY address
	)
	INSERT INTO daily_market_caps (address, market_cap)
	SELECT address, average_market_cap
	FROM avg_market_caps;
	`
	try {
		await env.DB.prepare(query).run();
	} catch (error) {
		console.error(error);
	}
}

async function getPrices(env: Env) : Promise<any> {
	const response = await fetch(`https://api-v3.raydium.io/mint/price?mints=${ANTI_ADDRESS},${PRO_ADDRESS}`, {
		method: "GET",
		headers: { "Content-Type": "application/json" },
	});

	const result: any = await response.json();

	const antiPrice = result.data[ANTI_ADDRESS];
	const proPrice = result.data[PRO_ADDRESS];

	return { antiPrice: antiPrice, proPrice: proPrice };
}


async function getTokenSupplies(mints: Array<string>) : Promise<any> {
	try {
		const results = await Promise.all(
			mints.map((mint) => getTokenSupply(mint))
		);

		return results;
	} catch (error: any) {
		console.error("Error fetching multiple token supplies:", error.message);
	}
}

async function getTokenSupply(mint: string) : Promise<string> {
	const solanaRpcURL = "https://api.mainnet-beta.solana.com";
	const body = {
		jsonrpc: "2.0",
		id: 1,
		method: "getTokenSupply",
		params: [mint]
	}

	try {
		const response = await fetch(solanaRpcURL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			throw new Error(`HTTP Error: ${response.status}`);
		}

		const json: any = await response.json();

		return json.result.value.uiAmountString;
	} catch (error: any) {
		console.error(`Error fetching token supply for ${mint}: `, error.message);
		throw error;
	}
}

async function getPrice(env : Env, address: string) : Promise<Response> {
	try {
		const result = await env.DB.prepare("SELECT * from prices WHERE address = ? ORDER BY timestamp DESC LIMIT 1")
			.bind(address)
			.first();

		if (result) {
			return Response.json(result);
		} else {
			return Response.json({error: "Could not get the price"})
		}
	} catch (error) {
		console.error(`Error fetching price for ${address}:`, error);
		return Response.json({error: "Could not get the price"})
	}
}

async function getHistory(env : Env, address : string) : Promise<Response> {
	try {
			const { results } = await env.DB.prepare("SELECT * FROM prices WHERE address = ?")
			.bind(address)
			.all();

			return Response.json(results);
	} catch (error) {
		console.error(`Error fetching history for ${address}:`, error);
		return Response.json({ error: "Could not get the history" })
	}
}

async function getHourlyPrices(env: Env, address: string): Promise<Response> {
	try {
		const { results } = await env.DB.prepare("SELECT * from hourly_prices WHERE address = ?").bind(address).all();

		return Response.json(results);
	} catch (error) {
		console.error(`Error fetching hourly prices for ${address}:`, error);
		return Response.json({ error: "Could not get hourly prices" })
	}
}

async function getDailyPrices(env: Env, address: string): Promise<Response> {
	try {
		const { results } = await env.DB.prepare("SELECT * from daily_prices WHERE address = ?").bind(address).all();

		return Response.json(results);
	} catch (error) {
		console.error(`Error fetching daily prices for ${address}:`, error);
		return Response.json({ error: "Could not get daily prices" })
	}
}

async function getMarketCap(env : Env, address: string) : Promise<Response> {
	try {
		const result = await env.DB.prepare("SELECT * from market_caps WHERE address = ? ORDER BY timestamp DESC LIMIT 1")
			.bind(address)
			.first();

		if (result) {
			return Response.json(result);
		} else {
			return Response.json({error: "Could not get the market cap"})
		}
	} catch (error) {
		console.error(`Error fetching market cap for ${address}:`, error);
		return Response.json({error: "Could not get the market cap"})
	}
}

async function getMarketCapHistory(env : Env, address : string) : Promise<Response> {
	try {
			const { results } = await env.DB.prepare("SELECT * FROM market_caps WHERE address = ?")
			.bind(address)
			.all();

			return Response.json(results);
	} catch (error) {
		console.error(`Error fetching market cap history for ${address}:`, error);
		return Response.json({ error: "Could not get the market cap history" })
	}
}

async function getDailyMarketCaps(env: Env, address: string): Promise<Response> {
	try {
		const { results } = await env.DB.prepare("SELECT * from daily_market_caps WHERE address = ?").bind(address).all();

		return Response.json(results);
	} catch (error) {
		console.error(`Error fetching daily market caps for ${address}:`, error);
		return Response.json({ error: "Could not get daily market caps" })
	}
}
