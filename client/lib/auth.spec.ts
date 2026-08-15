import { describe, expect, it } from "vitest";
import { authenticateDemoAccount, demoAccounts } from "./auth";

describe("REA demo authentication", () => {
  it("provides one account for every dashboard role", () => {
    expect(demoAccounts.map((account) => account.role)).toEqual([
      "rea",
      "field",
      "consultant",
    ]);
    expect(demoAccounts[0].roleLabel).toBe("REA Dashboard");
  });

  it.each(demoAccounts)("authenticates the $roleLabel account", (account) => {
    expect(authenticateDemoAccount(account.email, account.password)?.path).toBe(
      account.path,
    );
  });

  it("rejects invalid demo credentials", () => {
    expect(
      authenticateDemoAccount("rea.admin@demo.ng", "wrong-password"),
    ).toBeNull();
  });
});
