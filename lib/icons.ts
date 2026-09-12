import {
  ArrowLeftRight,
  Banknote,
  Briefcase,
  Bus,
  CirclePlus,
  CircleHelp,
  Clapperboard,
  CreditCard,
  Fuel,
  Gift,
  GraduationCap,
  HandCoins,
  Handshake,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Percent,
  Plane,
  PiggyBank,
  Receipt,
  Repeat,
  Scissors,
  Shield,
  ShoppingBag,
  ShoppingBasket,
  SlidersHorizontal,
  Sofa,
  Sparkles,
  Tag,
  TrendingUp,
  Undo2,
  Utensils,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Seeded category icons and account types resolve through here. */
const ICONS: Record<string, LucideIcon> = {
  "shopping-basket": ShoppingBasket,
  utensils: Utensils,
  bus: Bus,
  fuel: Fuel,
  home: House,
  zap: Zap,
  wifi: Wifi,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  "shopping-bag": ShoppingBag,
  clapperboard: Clapperboard,
  repeat: Repeat,
  plane: Plane,
  sofa: Sofa,
  scissors: Scissors,
  gift: Gift,
  shield: Shield,
  landmark: Landmark,
  receipt: Receipt,
  percent: Percent,
  "arrow-left-right": ArrowLeftRight,
  "sliders-horizontal": SlidersHorizontal,
  "circle-help": CircleHelp,
  briefcase: Briefcase,
  laptop: Laptop,
  sparkles: Sparkles,
  "trending-up": TrendingUp,
  "undo-2": Undo2,
  "circle-plus": CirclePlus,
  tag: Tag,
  wallet: Wallet,
  "hand-coins": HandCoins,
  handshake: Handshake,
};

export function iconFor(name?: string | null): LucideIcon {
  return ICONS[name ?? ""] ?? Tag;
}

/** Account types get their own glyph, so a row reads at a glance. */
export function iconForAccountType(type: string): LucideIcon {
  switch (type) {
    case "cash":
      return Banknote;
    case "wallet":
      return Wallet;
    case "bank":
      return Landmark;
    case "savings":
      return PiggyBank;
    case "investment":
      return TrendingUp;
    case "credit_card":
      return CreditCard;
    case "receivable":
      return HandCoins;
    case "payable":
      return Handshake;
    default:
      return Wallet;
  }
}
