import { Command } from "commander";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import fs from "node:fs";

const program = new Command();

program
  .name("lumen")
  .description(
    "Administrative CLI for managing Lumen wallets, policies, sponsor balances, and cosigning",
  )
  .version("0.1.0");

const DEFAULT_SERVER_URL = process.env.LUMEN_SERVER_URL || "http://localhost:3000";

program
  .command("status")
  .description("Checks server health and sponsor account balance")
  .option("-s, --server <url>", "Lumen server URL", DEFAULT_SERVER_URL)
  .action(async (options) => {
    try {
      console.log(`Connecting to Lumen server at ${options.server}...`);
      const healthRes = await fetch(`${options.server}/health`);
      if (!healthRes.ok) {
        throw new Error(`Health check failed with status ${healthRes.status}`);
      }
      const healthData = await healthRes.json();
      console.log("Server Health:", JSON.stringify(healthData, null, 2));

      const sponsorRes = await fetch(`${options.server}/sponsor/status`);
      if (sponsorRes.ok) {
        const sponsorData = await sponsorRes.json();
        console.log("Sponsor Account Status:", JSON.stringify(sponsorData, null, 2));
      } else {
        console.log("Sponsor status endpoint unavailable or returned status:", sponsorRes.status);
      }
    } catch (err: any) {
      console.error("Error fetching status:", err.message || err);
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
      console.log("Policy Spec:", JSON.stringify(policy, null, 2));
    } catch (err: any) {
      console.error("Error getting policy:", err.message || err);
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
      console.log("Policy set successfully:", JSON.stringify(created, null, 2));
    } catch (err: any) {
      console.error("Error setting policy:", err.message || err);
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

      console.log(`Policy for wallet ${walletId} deleted successfully.`);
    } catch (err: any) {
      console.error("Error deleting policy:", err.message || err);
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
      console.log("Requesting wallet creation from server...");
      const res = await fetch(`${options.server}/wallet/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Wallet creation failed: HTTP ${res.status}`);
      }

      const result = await res.json();
      console.log("Wallet created successfully:");
      console.log("Address:", result.address);
      console.log("Public Key:", result.publicKey);
    } catch (err: any) {
      console.error("Error creating wallet:", err.message || err);
      process.exit(1);
    }
  });

const cosignCmd = program
  .command("cosign")
  .description("Cosigning and transaction inspection tools");

cosignCmd
  .command("inspect <xdr>")
  .description("Decodes transaction XDR and simulates policy check")
  .option(
    "-n, --network-passphrase <passphrase>",
    "Stellar Network Passphrase",
    "Test SDF Network ; July 2015",
  )
  .action((xdr, options) => {
    try {
      const tx = TransactionBuilder.fromXDR(xdr, options.networkPassphrase);
      console.log("Decoded Transaction Details:");
      console.log("Source Account:", (tx as any).source);
      console.log("Fee:", (tx as any).fee);
      console.log("Operations Count:", (tx as any).operations?.length || 0);

      if ((tx as any).operations) {
        (tx as any).operations.forEach((op: any, index: number) => {
          console.log(`  Op #${index + 1}: ${op.type}`);
          if (op.destination) console.log(`    Destination: ${op.destination}`);
          if (op.amount) console.log(`    Amount: ${op.amount}`);
        });
      }
    } catch (err: any) {
      console.error("Error decoding transaction XDR:", err.message || err);
      process.exit(1);
    }
  });

cosignCmd
  .command("submit <xdr> <walletAddress>")
  .description("Submit transaction XDR to the server for policy validation and cosigning")
  .option("-s, --server <url>", "Lumen server URL", DEFAULT_SERVER_URL)
  .action(async (xdr, walletAddress, options) => {
    try {
      const res = await fetch(`${options.server}/cosign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xdr, walletAddress }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Cosign request failed: HTTP ${res.status} - ${errText}`);
      }

      const result = await res.json();
      console.log("Transaction cosigned successfully:");
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error("Error submitting transaction for cosigning:", err.message || err);
      process.exit(1);
    }
  });

program.parse(process.argv);
