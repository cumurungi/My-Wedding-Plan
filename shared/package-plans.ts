export const packagePlans = [
  {
    code: 'basic',
    name: 'Basic Plan',
    priceRwf: 200_000,
    description: 'Budget allocation, recommended vendors, and the option to request vendor changes.',
    features: ['Budget allocation', 'Recommended vendors', 'Request vendor changes'],
  },
  {
    code: 'standard',
    name: 'Standard Plan',
    priceRwf: 400_000,
    description: 'Everything in Basic, with our team contacting vendors on your behalf.',
    features: ['Everything in Basic', 'Personalized budget adjustments', 'Our team contacts vendors on your behalf'],
  },
  {
    code: 'premium',
    name: 'Premium Plan',
    priceRwf: 1_000_000,
    description: 'Everything in Standard, plus ongoing coordination.',
    features: ['Everything in Standard', 'Ongoing coordination'],
  },
  {
    code: 'event_short',
    name: 'Short Event Plan',
    priceRwf: 100_000,
    description: 'A practical plan and vendor recommendations for a shorter event.',
    features: ['Event budget allocation', 'Recommended vendors', 'No ongoing coordination'],
  },
] as const;

export const packageCheckoutClaimStorageKey = 'my-wedding-plan-package-claim';
export type PackageCode = (typeof packagePlans)[number]['code'];
export type EventType = 'wedding' | 'birthday' | 'bridal_shower' | 'baby_shower' | 'meeting' | 'anniversary' | 'graduation' | 'other';
export const eventTypeLabels: Record<EventType, string> = {
  wedding: 'Wedding',
  birthday: 'Birthday',
  bridal_shower: 'Bridal shower',
  baby_shower: 'Baby shower',
  meeting: 'Meeting',
  anniversary: 'Anniversary',
  graduation: 'Graduation',
  other: 'Other event',
};
export type PackageOrderStatus = 'pending' | 'successful' | 'failed';
export type PackageOrderView = {
  id: number;
  code: PackageCode;
  name: string;
  priceRwf: number;
  status: PackageOrderStatus;
  paymentStage?: 'deposit' | 'balance';
  paymentMethod: 'mtn_momo' | 'bank_transfer';
  phone?: string;
  payerReference?: string | null;
};
export type BankTransferDetails = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string | null;
};
export type ManualMomoDetails = {
  phone: string;
  accountName: string;
};
export type CouplePackageView = {
  plans: typeof packagePlans;
  activePackage: (PackageOrderView & { paidRwf: number; balanceRwf: number; balanceAvailable: boolean }) | null;
  pendingOrder: PackageOrderView | null;
  paymentMethods: {
    mtnMomo: ManualMomoDetails | null;
    bankTransfer: BankTransferDetails | null;
  };
};

export function getPackagePlan(code: string) {
  return packagePlans.find((plan) => plan.code === code);
}

export function packageIncludesClientWorkspaceTools(code: string | null | undefined): boolean {
  return code === 'standard' || code === 'premium';
}
