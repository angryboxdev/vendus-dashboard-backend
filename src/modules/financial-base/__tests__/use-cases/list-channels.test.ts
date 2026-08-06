import { ListChannelsUseCase } from "../../application/use-cases/list-channels.use-case.js";
import { FakeChannelRepository } from "../fakes/fake-channel-repository.js";
import { Channel } from "../../domain/entities/channel.js";

const now = new Date();

function makeChannel(id: string, code: string, name: string, sortOrder: number, isActive = true): Channel {
  return Channel.reconstitute({ id, code, name, sortOrder, isActive, createdAt: now, updatedAt: now });
}

describe("ListChannelsUseCase", () => {
  it("devolve todos os canais sem filtro", async () => {
    const repo = new FakeChannelRepository();
    repo.seed(makeChannel("id-1", "SALON",     "Salão",     1));
    repo.seed(makeChannel("id-2", "TAKEAWAY",  "Take Away", 2));
    repo.seed(makeChannel("id-3", "UBER_EATS", "Uber Eats", 3, false));
    const useCase = new ListChannelsUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(3);
  });

  it("filtra apenas canais ativos", async () => {
    const repo = new FakeChannelRepository();
    repo.seed(makeChannel("id-1", "SALON",     "Salão",     1));
    repo.seed(makeChannel("id-2", "UBER_EATS", "Uber Eats", 2, false));
    const useCase = new ListChannelsUseCase(repo);

    const result = await useCase.execute(true);

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("SALON");
  });

  it("filtra apenas canais inativos", async () => {
    const repo = new FakeChannelRepository();
    repo.seed(makeChannel("id-1", "SALON",     "Salão",     1));
    repo.seed(makeChannel("id-2", "UBER_EATS", "Uber Eats", 2, false));
    const useCase = new ListChannelsUseCase(repo);

    const result = await useCase.execute(false);

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("UBER_EATS");
  });

  it("devolve lista vazia quando não há canais", async () => {
    const repo = new FakeChannelRepository();
    const useCase = new ListChannelsUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  it("mapeia corretamente os campos do DTO", async () => {
    const repo = new FakeChannelRepository();
    repo.seed(makeChannel("id-1", "GLOVO", "Glovo", 1));
    const useCase = new ListChannelsUseCase(repo);

    const [dto] = await useCase.execute();

    expect(dto.id).toBe("id-1");
    expect(dto.code).toBe("GLOVO");
    expect(dto.name).toBe("Glovo");
    expect(dto.sortOrder).toBe(1);
    expect(dto.isActive).toBe(true);
  });

  it("devolve canais ordenados por sortOrder", async () => {
    const repo = new FakeChannelRepository();
    repo.seed(makeChannel("id-3", "BOLT",     "Bolt",      3));
    repo.seed(makeChannel("id-1", "SALON",    "Salão",     1));
    repo.seed(makeChannel("id-2", "TAKEAWAY", "Take Away", 2));
    const useCase = new ListChannelsUseCase(repo);

    const result = await useCase.execute();

    expect(result.map((c) => c.code)).toEqual(["SALON", "TAKEAWAY", "BOLT"]);
  });
});
