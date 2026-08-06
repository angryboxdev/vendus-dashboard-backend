export interface ChannelDTO {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ListChannelsPort {
  execute(isActive?: boolean): Promise<ChannelDTO[]>;
}
