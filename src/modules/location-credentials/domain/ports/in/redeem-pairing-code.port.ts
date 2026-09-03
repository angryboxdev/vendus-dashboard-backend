export interface RedeemPairingCodeCommand {
  code: string;
}

export interface RedeemPairingCodeResult {
  /** Raw, opaque token — returned exactly once, never stored or returned again. */
  token: string;
}

export interface RedeemPairingCodePort {
  execute(command: RedeemPairingCodeCommand): Promise<RedeemPairingCodeResult>;
}
