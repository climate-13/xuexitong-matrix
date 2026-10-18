export type SelectorItem = {
  label: string;
  mutable: boolean;
};

export type SelectorData = {
  label: string;
  annotation?: string;
  selectedIndex: number;
  mutable: boolean;
  items: SelectorItem[];
};

export type SelectorMethods = {
  select(index: number): void;
  create(name: string): void;
  edit(index: number, name: string): void;
  remove(index: number): void;
};
