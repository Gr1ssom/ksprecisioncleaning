import {
  Bath, BedDouble, Briefcase, CookingPot, DoorOpen, MoveHorizontal, Sofa, Square, Stethoscope, WashingMachine,
  UtensilsCrossed, Car, Dumbbell, Presentation, Baby, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  kitchen: CookingPot, bathroom: Bath, restroom: Bath, bath: Bath, bedroom: BedDouble, "living area": Sofa, living: Sofa,
  office: Briefcase, hallway: MoveHorizontal, hall: MoveHorizontal, entry: DoorOpen, lobby: DoorOpen, operatory: Stethoscope,
  laundry: WashingMachine, dining: UtensilsCrossed, garage: Car, gym: Dumbbell, conference: Presentation, nursery: Baby,
};

export function roomIcon(type: string): LucideIcon {
  const k = type.trim().toLowerCase();
  return ICONS[k] ?? Object.entries(ICONS).find(([key]) => k.includes(key))?.[1] ?? Square;
}
