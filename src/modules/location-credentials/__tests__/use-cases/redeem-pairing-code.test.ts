import { RedeemPairingCodeUseCase } from "../../application/use-cases/redeem-pairing-code.use-case.js";
import { FakePairingCodeRepository } from "../fakes/fake-pairing-code-repository.js";
import { FakeLocationTokenRepository } from "../fakes/fake-location-token-repository.js";
import { PairingCode } from "../../domain/entities/pairing-code.js";
import {
  PairingCodeAlreadyUsedError,
  PairingCodeExpiredError,
  PairingCodeNotFoundError,
} from "../../domain/errors.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_A = mintOrganizationId("org-a");

function makeUseCase() {
  const pairingCodeRepository = new FakePairingCodeRepository();
  const locationTokenRepository = new FakeLocationTokenRepository();
  const useCase = new RedeemPairingCodeUseCase(pairingCodeRepository, locationTokenRepository);
  return { pairingCodeRepository, locationTokenRepository, useCase };
}

async function seedActiveCode(
  pairingCodeRepository: FakePairingCodeRepository,
  overrides: Partial<{ locationId: string; expiresAt: Date; description: string | null }> = {},
) {
  const code = PairingCode.create({
    organizationId: ORG_A,
    locationId: overrides.locationId ?? "loc-1",
    code: "ABCD1234",
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    description: overrides.description,
  });
  await pairingCodeRepository.save(code);
  return code;
}

describe("RedeemPairingCodeUseCase", () => {
  it("redeemed once succeeds and mints a token scoped to the correct organization and location", async () => {
    const { pairingCodeRepository, locationTokenRepository, useCase } = makeUseCase();
    await seedActiveCode(pairingCodeRepository, { locationId: "loc-1" });

    const result = await useCase.execute({ code: "ABCD1234" });

    expect(typeof result.token).toBe("string");
    expect(result.token.length).toBeGreaterThan(0);

    const [saved] = locationTokenRepository.all();
    expect(saved).toBeDefined();
    expect(saved!.organizationId).toBe(ORG_A);
    expect(saved!.locationId).toBe("loc-1");
    // The stored value is a hash, never the raw token.
    expect(saved!.tokenHash).not.toBe(result.token);
    expect(saved!.description).toBeNull();
  });

  it("copies the pairing code's description onto the minted token", async () => {
    const { pairingCodeRepository, locationTokenRepository, useCase } = makeUseCase();
    await seedActiveCode(pairingCodeRepository, { description: "Kitchen monitor" });

    await useCase.execute({ code: "ABCD1234" });

    const [saved] = locationTokenRepository.all();
    expect(saved!.description).toBe("Kitchen monitor");
  });

  it("redeemed a second time fails", async () => {
    const { pairingCodeRepository, useCase } = makeUseCase();
    await seedActiveCode(pairingCodeRepository);

    await useCase.execute({ code: "ABCD1234" });

    await expect(useCase.execute({ code: "ABCD1234" })).rejects.toThrow(PairingCodeAlreadyUsedError);
  });

  it("an expired code fails, and is burned by the attempt", async () => {
    const { pairingCodeRepository, locationTokenRepository, useCase } = makeUseCase();
    await seedActiveCode(pairingCodeRepository, { expiresAt: new Date(Date.now() - 1) });

    await expect(useCase.execute({ code: "ABCD1234" })).rejects.toThrow(PairingCodeExpiredError);

    expect(locationTokenRepository.all()).toHaveLength(0);
    const burned = await pairingCodeRepository.findByCode("ABCD1234");
    expect(burned!.isBurned).toBe(true);

    // Second attempt against the same (now-burned, expired) code reports
    // "already used", not "expired" again — it was consumed on the first
    // attempt regardless of outcome (D6).
    await expect(useCase.execute({ code: "ABCD1234" })).rejects.toThrow(PairingCodeAlreadyUsedError);
  });

  it("an unknown code fails", async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.execute({ code: "NOPE0000" })).rejects.toThrow(PairingCodeNotFoundError);
  });
});
