import type { GetEnterprisesPort } from "../../domain/ports/in/get-enterprises.port.js";
import type { AirMenuEnterprise } from "../../domain/entities/air-menu-enterprise.js";

export class GetEnterprisesUseCase implements GetEnterprisesPort {
  constructor(private readonly enterprises: AirMenuEnterprise[]) {}

  execute(): AirMenuEnterprise[] {
    return this.enterprises;
  }
}
