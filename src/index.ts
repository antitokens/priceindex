 import Decimal from 'decimal.js';

 const ANTI_ADDRESS = "HB8KrN7Bb3iLWUPsozp67kS4gxtbA4W5QJX4wKPvpump";
 const PRO_ADDRESS = "CWFa2nxUMf5d1WwKtG9FS9kjUKGwKXWSjH8hFdWspump";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname } = new URL(request.url);

		if (pathname === "/api/price/history/anti") {
			const { results } = await env.DB.prepare("SELECT * FROM prices WHERE address = ?")
			.bind(ANTI_ADDRESS)
			.all();

			return Response.json(results);
		} else if (pathname === "/api/price/history/pro") {
			const { results } = await env.DB.prepare("SELECT * FROM prices WHERE address = ?")
			.bind(PRO_ADDRESS)
			.all();

			return Response.json(results);
		}

		return  new Response("Invalid request", {
			status: 404
		});
	},

	async scheduled(event, env, ctx) {
		const cronExpression = event.cron;

		try {
			if (cronExpression == "* * * * *") {
				await indexPrices(env);
			} else if (cronExpression == "0 * * * *") {
				await indexMarketCap(env);
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
