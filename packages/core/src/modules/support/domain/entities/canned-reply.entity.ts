import { newId } from "../../../../shared/kernel/id";

export interface CannedReplyProps {
  id: string;
  title: string;
  category: string;
  content: string;
  shortcut: string;
  createdAt: number;
}

export class CannedReply {
  constructor(public readonly props: CannedReplyProps) {}

  public static create(params: {
    id?: string;
    title: string;
    category: string;
    content: string;
    shortcut?: string;
    createdAt?: number;
  }): CannedReply {
    const rawShortcut = params.shortcut || `!${params.title.toLowerCase().replace(/\s+/g, "-")}`;
    return new CannedReply({
      id: params.id ?? newId("cnr"),
      title: params.title,
      category: params.category,
      content: params.content,
      shortcut: rawShortcut.startsWith("!") ? rawShortcut : `!${rawShortcut}`,
      createdAt: params.createdAt ?? Date.now(),
    });
  }

  public get id(): string {
    return this.props.id;
  }
  public get title(): string {
    return this.props.title;
  }
  public get category(): string {
    return this.props.category;
  }
  public get content(): string {
    return this.props.content;
  }
  public get shortcut(): string {
    return this.props.shortcut;
  }
}
