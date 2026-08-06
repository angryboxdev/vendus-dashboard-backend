interface ChannelProps {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Channel {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: ChannelProps) {
    this.id = props.id;
    this.code = props.code;
    this.name = props.name;
    this.sortOrder = props.sortOrder;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static reconstitute(props: ChannelProps): Channel {
    return new Channel(props);
  }
}
