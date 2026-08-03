import type { AirMenuEnterprise } from "../../entities/air-menu-enterprise.js";

export interface GetEnterprisesPort {
  execute(): AirMenuEnterprise[];
}
