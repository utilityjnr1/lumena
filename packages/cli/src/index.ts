import { Command } from "commander";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import fs from "node:fs";

const program = new Command();

program
  .name("lumen")
  .description("Administrative CLI for managing Lumen wallets, policies, sponsor balances, and cosigning")
  .version("0.1.0")
  .option("--json", "Output machine-readable JSON instead of human-readable text")
  .passGlobalOptions();

const DEFAULT_SERVER_URL = process.env.LUMEN_SERVER_URL || "http://localhost:3000";

program
  .command("status")
  .description("Checks server health and sponsor account balance")
  .option("-s, --server <url>", "Lumen server URL", DEFAULT_SERVER_URL)
  .action(async (options) => {
    try {
      const healthRes = await fetch(`${options.server}/health`);
      if (!healthRes.ok) {
        throw new Error(`Health check failed with status ${healthRes.status}`);
      }
      const healthData = await healthRes.json();

      const sponsorRes = await fetch(`${options.server}/sponsor/status`);
      let sponsorData = null;
      if (sponsorRes.ok) {
        sponsorData = await sponsorRes.json();
      }

      if (options.json) {
        console.log(JSON.stringify({ health: healthData, sponsor: sponsorData }, null, 2));
      } else {
        console.log(`Connecting to Lumen server at ${options.server}...`);
        console.log("Server Health:", JSON.stringify(healthData, null, 2));
        if (sponsorData) {
          console.log("Sponsor Account Status:", JSON.stringify(sponsorData, null, 2));
        } else {
          console.log("Sponsor status endpoint unavailable or returned status:", sponsorRes.status);
        }
      }
    } catch (err: any) {
      if (options.json) {
        console.error(JSON.stringify({ error: err.message || String(err) }));
      } else {
        console.error("Error fetching status:", err.message || err);
      }
      process.exit(1);
    }
  });

const policyCmd = program.command("policy").description("Manage wallet policy rules");

policyCmd
  .command("get <walletId>")
  .description("Inspect policy spec for a wallet")
  .option("-s, --server <url>", "Lumen server URL", DEFAULT_SERVER_URL)
  .action(async (walletId, options) => {
    try {
      const res = await fetch(`${options.server}/policy/${walletId}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch policy: HTTP ${res.status}`);
      }
      const policy = await res.json();
      if (options.json) {
        console.log(JSON.stringify(policy, null, 2));
      } else {
        console.log("Policy Spec:", JSON.stringify(policy, null, 2));
      }
    } catch (err: any) {
      if (options.json) {
        console.error(JSON.stringify({ error: err.message || String(err) }));
      } else {
        console.error("Error getting policy:", err.message || err);
      }
      process.exit(1);
    }
  });

policyCmd
  .command("set <file>")
  .description("Apply policy spec from a JSON file")
  .option("-s, --server <url>", "Lumen server URL", DEFAULT_SERVER_URL)
  .action(async (file, options) => {
    try {
      if (!fs.existsSync(file)) {
        throw new Error(`Policy spec file not found: ${file}`);
      }
      const content = fs.readFileSync(file, "utf-8");
      const policyData = JSON.parse(content);

      const res = await fetch(`${options.server}/policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policyData),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to set policy: HTTP ${res.status} - ${errText}`);
      }

      const created = await res.json();
      if (options.json) {
        console.log(JSON.stringify(created, null, 2));
      } else {
        console.log("Policy set successfully:", JSON.stringify(created, null, 2));
      }
    } catch (err: any) {
      if (options.json) {
        console.error(JSON.stringify({ error: err.message || String(err) }));
      } else {
        console.error("Error setting policy:", err.message || err);
      }
      process.exit(1);
    }
  });

policyCmd
  .command("delete <walletId>")
  .description("Delete the policy for a wallet")
  .option("-s, --server <url>", "Lumen server URL", DEFAULT_SERVER_URL)
  .action(async (walletId, options) => {
    try {
      const res = await fetch(`${options.server}/policy/${walletId}`, {
        method: "DELETE",
      });

      if (res.status === 404) {
        throw new Error(`Policy not found for wallet: ${walletId}`);
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to delete policy: HTTP ${res.status} - ${errText}`);
      }

      if (options.json) {
        console.log(JSON.stringify({ success: true, walletId }, null, 2));
      } else {
        console.log(`Policy for wallet ${walletId} deleted successfully.`);
      }
    } catch (err: any) {
      if (options.json) {
        console.error(JSON.stringify({ error: err.message || String(err) }));
      } else {
        console.error("Error deleting policy:", err.message || err);
      }
      process.exit(1);
    }
  });

const walletCmd = program.command("wallet").description("Manage test sponsored wallets");

walletCmd
  .command("create")
  .description("Creates a test sponsored wallet")
  .option("-s, --server <url>", "Lumen server URL", DEFAULT_SERVER_URL)
  .action(async (options) => {
    try {
      const res = await fetch(`${options.server}/wallet/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Wallet creation failed: HTTP ${res.status}`);
      }

      const result = await res.json();
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log("Wallet created successfully:");
        console.log("Address:", result.address);
        console.log("Public Key:", result.publicKey);
      }
    } catch (err: any) {
      if (options.json) {
        console.error(JSON.stringify({ error: err.message || String(err) }));
      } else {
        console.error("Error creating wallet:", err.message || err);
      }
      process.exit(1);
    }
  });

const cosignCmd = program.command("cosign").description("Cosigning and transaction inspection tools");

cosignCmd
  .command("inspect <xdr>")
  .description("Decodes transaction XDR and simulates policy check")
  .option("-n, --network-passphrase <passphrase>", "Stellar Network Passphrase", "Test SDF Network ; July 2015")
  .action((xdr, options) => {
    try {
      const tx = TransactionBuilder.fromXDR(xdr, options.networkPassphrase);
      const source = (tx as any).source;
      const fee = (tx as any).fee;
      const operations = (tx as any).operations || [];
      const opCount = operations.length;

      const decodedOps = operations.map((op: any, index: number) => {
        const opInfo: any = { index: index + 1, type: op.type };
        if (op.destination) opInfo.destination = op.destination;
        if (op.amount) opInfo.amount = op.amount;
        return opInfo;
      });

      const output = {
        sourceAccount: source,
        fee,
        operationsCount: opCount,
        operations: decodedOps,
      };

      if (options.json) {
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.log("Decoded Transaction Details:");
        console.log("Source Account:", source);
        console.log("Fee:", fee);
        console.log("Operations Count:", opCount);

        decodedOps.forEach((op: any) => {
          console.log(`  Op #${op.index}: ${op.type}`);
          if (op.destination) console.log(`    Destination: ${op.destination}`);
          if (op.amount) console.log(`    Amount: ${op.amount}`);
        });
      }
    } catch (err: any) {
      if (options.json) {
        console.error(JSON.stringify({ error: err.message || String(err) }));
      } else {
        console.error("Error decoding transaction XDR:", err.message || err);
      }
      process.exit(1);
    }
  });

program.parse(process.argv);
