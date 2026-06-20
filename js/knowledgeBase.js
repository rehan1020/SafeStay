export const rules = [
  {
    id: "era_1",
    category: "Emergency Rental Assistance",
    description: "Financial assistance for rent and utilities to prevent eviction.",
    blockers: ["Income exceeds 80% AMI", "No proof of COVID-19/financial hardship impact", "Lease not in applicant's name"],
    bypass_strategies: ["Use self-attestation forms if documented proof is missing", "Check local community action agencies for non-federal funds with looser restrictions"]
  },
  {
    id: "sec8_1",
    category: "Section 8 Rights",
    description: "Protections for tenants with Housing Choice Vouchers against discrimination and unjust eviction.",
    blockers: ["Landlord refuses to accept voucher (source of income discrimination)", "Unit fails Housing Quality Standards (HQS) inspection"],
    bypass_strategies: ["Report landlord to local Fair Housing office if source of income discrimination is illegal in state/city", "Request extension for landlord to make repairs before voucher expires"]
  },
  {
    id: "evic_1",
    category: "Eviction Processes",
    description: "Legal proceedings required to remove a tenant from a rental property.",
    blockers: ["Self-help eviction (lockout, utility shutoff)", "Improper notice period given"],
    bypass_strategies: ["Call police to regain entry if illegally locked out", "File emergency injunction in housing court to restore utilities", "Use improper notice as defense to get case dismissed"]
  },
  {
    id: "dv_1",
    category: "Domestic Violence Protections",
    description: "Violence Against Women Act (VAWA) and local laws protecting survivors' housing rights.",
    blockers: ["Landlord attempts to evict due to noise/police calls related to abuse", "Victim cannot afford rent without abuser's income"],
    bypass_strategies: ["Invoke VAWA protections to prevent eviction based on criminal activity of abuser", "Request emergency transfer to new unit", "Break lease without penalty (depending on state law) with police report or protective order"]
  },
  {
    id: "lease_1",
    category: "Lease Violation & Non-Renewal Disputes",
    description: "Tenant rights when facing cure-or-quit notices, alleged lease violations, or non-renewal at lease end.",
    blockers: ["Landlord claims lease violation without proper documentation", "Non-renewal used as pretext for retaliation or discrimination", "Tenant unaware of cure period rights"],
    bypass_strategies: ["Demand written specification of alleged violation with evidence", "Invoke anti-retaliation statutes if non-renewal follows complaint or repair request", "Cure the violation within statutory period and document compliance in writing", "Check if local law requires 'just cause' for non-renewal"]
  },
  {
    id: "habit_1",
    category: "Habitability & Repair Withholding",
    description: "Tenant protections when landlord fails to maintain habitable conditions (heat, plumbing, mold, pests, structural safety).",
    blockers: ["Landlord ignores repair requests", "Tenant fears retaliation for complaining", "Tenant withholds rent without following legal procedure"],
    bypass_strategies: ["Send repair request in writing (email/letter) to create a paper trail", "File complaint with local housing/building code enforcement", "Use rent escrow or repair-and-deduct where state law permits — requires proper notice first", "Document conditions with dated photos/videos before and after reporting"]
  },
  {
    id: "cotenant_1",
    category: "Co-Tenant & Roommate Situations",
    description: "Issues where a co-tenant or unauthorized occupant creates lease liability, including roommate disputes, subletting, and unauthorized guests.",
    blockers: ["Co-tenant listed on lease moves out leaving remaining tenant liable for full rent", "Unauthorized occupant triggers lease violation", "Roommate's behavior (noise, damage) leads to eviction proceedings against all tenants"],
    bypass_strategies: ["Request lease amendment removing departed co-tenant's name", "Negotiate directly with landlord to add or remove occupants formally", "If co-tenant abandoned, document the departure and request sole-tenant status", "Consult legal aid about joint-and-several liability protections in your jurisdiction"]
  },
  {
    id: "immig_1",
    category: "Immigrant & Non-Citizen Housing Protections",
    description: "Housing rights for undocumented and non-citizen tenants, including protections against immigration-status-based discrimination and threats.",
    blockers: ["Landlord threatens to report immigration status to ICE", "Tenant fears interacting with government agencies or courts", "Tenant lacks SSN or government ID required by some assistance programs"],
    bypass_strategies: ["Fair Housing Act protects tenants regardless of immigration status — discrimination based on national origin is illegal", "ITIN (Individual Taxpayer Identification Number) may substitute for SSN in many assistance applications", "Many legal aid organizations serve clients regardless of immigration status — seek these out", "Landlord retaliation involving immigration threats may itself be a crime in some jurisdictions — document all threats"]
  }
];

export default rules;
