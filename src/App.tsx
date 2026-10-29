import { useCallback, useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { Heart, Sparkles, Wallet, Users, MapPin, CalendarDays, ChevronRight, Moon, Bell, Menu, ClipboardCheck, Lightbulb, ShieldCheck, Eye, EyeOff, Download, Share2, LogOut, FileCheck2, FileText, CircleDollarSign, MessageSquare, type LucideIcon } from 'lucide-react';
import AdminDashboard from './AdminDashboard';
import WeddingDetailsForm from './WeddingDetails';
import Brand from './Brand';
import ContactPage, { ContactDetails } from './ContactPage';
import PackagePlansPage from './PackagePlansPage';
import { CoupleChecklistPage, CoupleInspirationPage } from './CouplePages';
import './dark-theme.css';
import './budget-workspace.css';
import './couple-pages.css';
import './package-plans.css';
import { hasWeddingBasics, type User, type WeddingDetails, type WeddingProfile } from './wedding';
import { LanguagePicker, useLanguage } from './i18n';
import { packageCheckoutClaimStorageKey, type CouplePackageView, type PackageOrderView } from '../shared/package-plans';
import { eventTypeLabels, type EventType } from '../shared/package-plans';
type AuthMode = 'register' | 'login';
type NavItem = [string, LucideIcon];
type CouplePage = 'Budget' | 'Packages' | 'Checklist' | 'Inspiration' | 'Contracts' | 'Payments' | 'Contact';
type CoupleWorkspace = {
  plan: null | { planId: number; version: number; requestedBudgetRwf: number | string; plannedTotalRwf: number | string; isOverBudget: boolean | number; status: 'proposed' | 'approved' | 'rejected'; reviewNote: string | null; allocations: { category: string; percent: number | string; targetAmountRwf: number | string; plannedAmountRwf: number | string; vendorName: string | null; verifiedPriceFromRwf: number | string | null; priceSource: string }[] };
  contracts: { id: number; title: string; amountRwf: number | string; signatureStatus: string; originalFilename: string; contractDate: string | null; vendorName: string; paidRwf: number | string; balanceRwf: number | string }[];
  payments: { id: number; amountRwf: number | string; paymentType: string; status: string; dueDate: string | null; paidDate: string | null; hasEvidence: boolean | number; contractTitle: string; vendorName: string }[];
};
type CoupleVendorRecommendation = { need: string; category: string; vendor: { id: number; businessName: string; location: string; priceFromRwf: number | string | null; priceToRwf: number | string | null; pricingBasis: 'fixed' | 'per_guest'; effectivePriceRwf: number | string; agreedPriceRwf: number | string | null; agreedPriceQuantity: number | null } | null; hasPricedVendor: boolean };
type CoupleVendorAvailability = { vendorId: number; availabilityStatus: 'not_checked' | 'waiting_for_vendor' | 'available' | 'unavailable' | 'approved' };
const coupleAvailabilityLabel: Record<CoupleVendorAvailability['availabilityStatus'], string> = { not_checked: 'Not checked', waiting_for_vendor: 'Waiting for vendor', available: 'Available', unavailable: 'Unavailable', approved: 'Approved' };

const money = (value?: number | null) => value ? `${Number(value).toLocaleString()} RWF` : 'Not set yet';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<WeddingProfile>({});
  const [view, setView] = useState<'home' | 'auth' | 'details' | 'packages'>('home');
  const [authMode, setAuthMode] = useState<AuthMode>('register');
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  const [detailsError, setDetailsError] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [packageAccess, setPackageAccess] = useState<CouplePackageView | null>(null);
  const [darkTheme, setDarkTheme] = useState(() => localStorage.getItem('my-wedding-plan-theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark-theme', darkTheme);
    localStorage.setItem('my-wedding-plan-theme', darkTheme ? 'dark' : 'light');
  }, [darkTheme]);

  async function claimPendingCheckout() {
    const savedCheckout = sessionStorage.getItem(packageCheckoutClaimStorageKey);
    if (!savedCheckout) return;
    let checkout: { orderId: number; claimToken: string };
    try {
      checkout = JSON.parse(savedCheckout) as { orderId: number; claimToken: string };
    } catch {
      sessionStorage.removeItem(packageCheckoutClaimStorageKey);
      throw new Error('Your saved checkout details are invalid. Please contact the planning team.');
    }
    if (!Number.isInteger(checkout.orderId) || typeof checkout.claimToken !== 'string') {
      sessionStorage.removeItem(packageCheckoutClaimStorageKey);
      throw new Error('Your saved checkout details are invalid. Please contact the planning team.');
    }
    const response = await fetch('/api/couple/package-orders/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkout),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not link your payment to this account.');
    sessionStorage.removeItem(packageCheckoutClaimStorageKey);
  }

  async function load() {
    let loadedUser: User | null = null;
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();
      loadedUser = data.user;
      setUser(loadedUser);
      if (loadedUser?.role === 'couple') {
        setView('packages');
        await claimPendingCheckout();
        const packageResponse = await fetch('/api/couple/package');
        const packageData = await packageResponse.json();
        if (!packageResponse.ok) throw new Error(packageData.error || 'Could not verify your planning package.');
        setPackageAccess(packageData);
        if (!packageData.activePackage) return;
        const p = await fetch('/api/couple/profile');
        if (!p.ok) throw new Error('Could not load your wedding profile.');
        const weddingProfile = (await p.json()).profile || {};
        setProfile(weddingProfile);
        setView(hasWeddingBasics(weddingProfile) ? 'home' : 'details');
      }
    } catch (cause) {
      if (loadedUser?.role === 'couple') {
        setView('packages');
        setNotice(cause instanceof Error ? cause.message : 'Could not verify your planning package.');
      }
    } finally {
      if (!loadedUser) setView('packages');
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(''); setBusy(true);
    let authenticatedCouple = false;
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries()) as Record<string, string>;
    try {
      const response = await fetch(`/api/auth/${authMode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not complete your request.');
      setUser(data.user);
      if (data.user.role === 'couple') {
        authenticatedCouple = true;
        setView('packages');
        await claimPendingCheckout();
        const packageResponse = await fetch('/api/couple/package');
        const packageData = await packageResponse.json();
        if (!packageResponse.ok) throw new Error(packageData.error || 'Could not verify your planning package.');
        setPackageAccess(packageData);
        if (packageData.activePackage) {
          const profileResponse = await fetch('/api/couple/profile');
          if (!profileResponse.ok) throw new Error('Could not load your wedding profile.');
          const weddingProfile = (await profileResponse.json()).profile || {};
          setProfile(weddingProfile);
          setView(hasWeddingBasics(weddingProfile) ? 'home' : 'details');
        }
      } else setView('home');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not complete your request.');
      if (authenticatedCouple) setView('packages');
    }
    setBusy(false);
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null); setProfile({}); setPackageAccess(null); setView('home');
  }

  const activatePackage = useCallback(async (activePackage: PackageOrderView) => {
    setPackageAccess((current) => current ? { ...current, activePackage, pendingOrder: null } : current);
    try {
      const response = await fetch('/api/couple/profile');
      if (!response.ok) throw new Error('Your payment is confirmed, but your wedding profile could not be loaded. Please reload this page.');
      const weddingProfile = (await response.json()).profile || {};
      setProfile(weddingProfile);
      setView(hasWeddingBasics(weddingProfile) ? 'home' : 'details');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Your package is active. Reload to continue.');
    }
  }, []);

  async function saveWeddingDetails(details: WeddingDetails) {
    setDetailsError(''); setSavingDetails(true);
    try {
      const response = await fetch('/api/couple/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save your event details.');
      setProfile(data.profile || details); setView('home'); setNotice('Your event details have been saved.');
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : 'Could not save your event details.');
    } finally { setSavingDetails(false); }
  }

  if (busy && !user && view === 'home') return <div className="loading"><Heart size={20} /> The EventNest</div>;
  if (view === 'auth') return <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={authenticate} busy={busy} notice={notice} onBack={() => setView('packages')} />;
  if (user?.role === 'admin') return <AdminShell user={user} onSignOut={signOut} darkTheme={darkTheme} onToggleTheme={() => setDarkTheme(!darkTheme)} />;
  if (view === 'details' && user?.role === 'couple' && packageAccess?.activePackage) return <WeddingDetailsForm user={user} profile={profile} packageCode={packageAccess.activePackage.code} busy={savingDetails} error={detailsError} onSave={saveWeddingDetails} />;
  const initialPage: CouplePage = view === 'packages' || (view === 'details' && !packageAccess?.activePackage) ? 'Packages' : 'Budget';
  return <CoupleShell user={user} profile={profile} packageAccess={packageAccess} initialPage={initialPage} onPackagePaid={activatePackage} mobileNav={mobileNav} setMobileNav={setMobileNav} onSignOut={signOut} setNotice={setNotice} notice={notice} onEditDetails={() => setView('details')} onAuth={(mode) => { setAuthMode(mode); setView('auth'); setNotice(''); }} darkTheme={darkTheme} onToggleTheme={() => setDarkTheme(!darkTheme)} />;
}

type CoupleShellProps = {
  user: User | null;
  profile: WeddingProfile;
  packageAccess: CouplePackageView | null;
  initialPage: CouplePage;
  onPackagePaid: (activePackage: PackageOrderView) => void;
  mobileNav: boolean;
  setMobileNav: Dispatch<SetStateAction<boolean>>;
  onSignOut: () => Promise<void>;
  setNotice: Dispatch<SetStateAction<string>>;
  notice: string;
  onEditDetails: () => void;
  onAuth: (mode: AuthMode) => void;
  darkTheme: boolean;
  onToggleTheme: () => void;
};

function CoupleShell({ user, profile, packageAccess, initialPage, onPackagePaid, mobileNav, setMobileNav, onSignOut, setNotice, notice, onEditDetails, onAuth, darkTheme, onToggleTheme }: CoupleShellProps) {
  const { t } = useLanguage();
  const [activePage, setActivePage] = useState<CouplePage>(initialPage);
  const [workspace, setWorkspace] = useState<CoupleWorkspace | null>(null);
  const [vendorRecommendations, setVendorRecommendations] = useState<CoupleVendorRecommendation[]>([]);
  useEffect(() => {
    if (!user) { setWorkspace(null); setVendorRecommendations([]); return; }
    void fetch('/api/couple/workspace').then((response) => response.ok ? response.json() : null).then((data) => setWorkspace(data)).catch(() => setWorkspace(null));
    void fetch('/api/couple/vendor-recommendations').then((response) => response.ok ? response.json() : null).then((data) => setVendorRecommendations(data?.recommendations ?? [])).catch(() => setVendorRecommendations([]));
  }, [user?.id, profile.vendorNeeds?.join('|')]);
  const nav: NavItem[] = user && !packageAccess?.activePackage
    ? [['Packages', Heart], ['Inspiration', Lightbulb], ['Contact', MessageSquare]]
    : [['Budget', Wallet], ['Packages', Heart], ['Inspiration', Lightbulb], ['Contact', MessageSquare], ['Checklist', ClipboardCheck], ['Contracts', FileText], ['Payments', CircleDollarSign]];
  const eventLabel = eventTypeLabels[(profile.eventType ?? 'wedding') as EventType] ?? 'Event';
  const pageDescription: Record<CouplePage, string> = { Budget: 'See your budget, selected services, and planning proposal.', Packages: 'Choose a plan for your wedding or another event.', Checklist: 'See your requested services and the progress your planning team has marked.', Inspiration: 'Explore ideas and event inspiration shared with you.', Contracts: 'Review vendor contracts shared with your account.', Payments: 'Track payments recorded against your vendor contracts.', Contact: 'Send a message to our planning team.' };
  function savePlan() {
    const lines = ['THE EVENTNEST', '', `Client: ${user?.name ?? ''}`, `Event: ${profile.eventName || eventLabel}`, `Budget: ${money(profile.budgetRwf)}`, `Guests / attendees: ${profile.guestCount ?? 'Not set'}`, `Event date: ${profile.weddingDate ?? 'Not set'}`, `Location: ${profile.location ?? 'Not set'}`, ...(profile.weddingFormat ? [`Celebration format: ${profile.weddingFormat}`] : []), '', 'SERVICES NEEDED', ...(profile.vendorNeeds?.length ? profile.vendorNeeds.map((need) => { const matched = vendorRecommendations.filter((item) => item.need === need && item.vendor); return `• ${need}${matched.length ? ` — ${matched.map((item) => item.vendor!.businessName).join(', ')}` : ''}`; }) : ['No specific services selected'])];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'eventnest-plan.txt'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('A copy of your event plan was downloaded.');
  }
  async function sharePlan() {
    const summary = `${user?.name ?? 'Our event'} · ${profile.eventName || eventLabel} · ${profile.weddingDate || 'Date to be confirmed'} · ${profile.location || 'Location to be confirmed'} · ${profile.guestCount ?? 'Guest count to be confirmed'} attendees · ${money(profile.budgetRwf)} budget`;
    try {
      if (navigator.share) await navigator.share({ title: 'The EventNest', text: summary, url: window.location.origin });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(`${summary}\n${window.location.origin}`); setNotice('Plan summary and app link copied.'); }
      else { window.prompt('Copy this plan summary and link:', `${summary}\n${window.location.origin}`); }
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setNotice('Could not share the plan on this device.'); }
  }
  return <div className="app-shell">
    {mobileNav && <button className="mobile-nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside id="couple-navigation" className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <Brand />
      <div className="side-rule" />
      <nav>{nav.map(([label, Icon]) => <button type="button" className={`nav-item ${activePage === label ? 'active' : ''}`} aria-current={activePage === label ? 'page' : undefined} key={label} onClick={() => { setActivePage(label as CouplePage); setMobileNav(false); }}><Icon size={17} strokeWidth={1.7} />{t(label)}</button>)}</nav>
      {user && <><div className="side-rule bottom-rule" /><button type="button" className="nav-item couple-sidebar-action" onClick={savePlan}><Download size={17} />{t('Save plan')}</button><button type="button" className="nav-item couple-sidebar-action" onClick={() => void sharePlan()}><Share2 size={17} />{t('Share plan')}</button><div className="couple-side-user"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span><b>{user.name}</b><small>{t('Event account')}</small></span></div><button type="button" className="nav-item couple-sidebar-action couple-signout" onClick={() => void onSignOut()}><LogOut size={17} />{t('Sign out')}</button></>}
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="icon-button menu-button" aria-label={mobileNav ? 'Close menu' : 'Open menu'} aria-controls="couple-navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(!mobileNav)}><Menu size={19} /></button><div className="top-actions"><LanguagePicker />{user ? <><span className="welcome-user">{t('Hello')}, {user.name.split(' ')[0]}</span><button className="pill-button" onClick={onEditDetails}>{t('Edit details')}</button></> : <><button className="text-button" onClick={() => onAuth('login')}>{t('Sign in')}</button><button className="pill-button" onClick={() => onAuth('register')}>{t('Create free account')}</button></>}<button className="icon-button" aria-label={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} onClick={onToggleTheme}>{darkTheme ? <Sparkles size={17} /> : <Moon size={17} />}</button><button className="icon-button notification" aria-label="Notifications"><Bell size={17} /></button>{user ? <button className="avatar" title="Sign out" onClick={onSignOut}>{user.name.slice(0, 1).toUpperCase()}</button> : <span className="avatar avatar-guest"><Heart size={16} /></span>}</div></header>
      <div className={`content ${user ? 'couple-content' : ''}`}>
        <div className="page-title"><Sparkles size={19} /><div><h1>{activePage === 'Contact' ? t('Contact us') : activePage === 'Packages' ? 'Planning packages' : activePage === 'Inspiration' ? t('Inspiration') : activePage === 'Budget' && user ? `${profile.eventName || eventLabel} plan` : user ? t(activePage) : t('Sign in to view your event details.')}</h1><p>{activePage === 'Contact' ? t(pageDescription.Contact) : activePage === 'Packages' ? t(pageDescription.Packages) : activePage === 'Inspiration' ? t('Explore ideas and celebration examples, no account needed.') : user ? t(pageDescription[activePage]) : t('Sign in to view your event details.')}</p></div>{user && activePage !== 'Packages' && <button className="text-button couple-edit-button" onClick={onEditDetails}>{t('Edit event details')}</button>}</div>
        {activePage === 'Contact' && <ContactPage user={user} />}
        {activePage === 'Packages' && <PackagePlansPage user={user} onAuth={onAuth} onPaid={onPackagePaid} />}
        {user && <>
          {activePage === 'Budget' && <><section className="summary-strip"><Summary Icon={Wallet} label={profile.eventType === 'wedding' ? 'Wedding budget' : 'Event budget'} value={money(profile.budgetRwf)} /><Summary Icon={Users} label={t('Guests')} value={profile.guestCount ? `${profile.guestCount} people` : 'Your guest count'} /><Summary Icon={MapPin} label={t('Location')} value={profile.location || 'Your chosen location'} /><Summary Icon={CalendarDays} label={profile.eventType === 'wedding' ? t('Wedding date') : 'Event date'} value={profile.weddingDate ? new Date(`${profile.weddingDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Your chosen date'} /></section><div className="couple-budget-layout"><section className="budget-card"><span className="eyebrow light">{t('Your total budget')}</span><strong>{money(profile.budgetRwf)}</strong><div className="donut"><div className="donut-inner"><b>{workspace?.plan && profile.budgetStatus !== 'pending' ? `${Math.min(100, Math.round(Number(workspace.plan.plannedTotalRwf) / Number(profile.budgetRwf || 1) * 100))}%` : '?'}</b><span>{t(workspace?.plan && profile.budgetStatus !== 'pending' ? 'Plan estimate' : 'Awaiting plan')}</span></div></div><button className="budget-adjust" onClick={onEditDetails}>{t(profile.eventType === 'wedding' ? 'Edit wedding details' : 'Edit event details')} <span>?</span></button></section>{workspace?.plan && profile.budgetStatus !== 'pending' && <IllustrativeBudgetPlan profile={profile} user={user} recommendations={vendorRecommendations} plan={workspace.plan} />}</div><CoupleWorkspaceSections workspace={workspace} page="Budget" budgetStatus={profile.budgetStatus} /></>}
          {activePage === 'Checklist' && <CoupleChecklistPage />}
          {activePage === 'Inspiration' && <CoupleInspirationPage publicAccess={!packageAccess?.activePackage} onJoin={() => onAuth('register')} />}
          {(activePage === 'Contracts' || activePage === 'Payments') && <CoupleWorkspaceSections workspace={workspace} page={activePage} />}
        </>}
        {!user && activePage === 'Inspiration' && <CoupleInspirationPage publicAccess onJoin={() => onAuth('register')} />}
        {!user && activePage !== 'Contact' && activePage !== 'Packages' && activePage !== 'Inspiration' && <GuestWorkspace onAuth={onAuth} onContact={() => { setActivePage('Contact'); setMobileNav(false); }} />}
        <footer>{t('Thoughtfully made for your day')} <Heart size={12} /></footer>
        {notice && <div className="toast" onClick={() => {}}>{notice}<button onClick={() => setNotice('')}>×</button></div>}
      </div>
    </main>
  </div>;
}

const illustrativeRows: [string, string, string][] = [
  ['Venue','2%','#405a50'],['Catering','40%','#b9b3a5'],['Decoration','25%','#e99581'],['Florist & Flowers','2%','#8fa48f'],['Photography & Video','5%','#a2b4b3'],['Makeup Artist','1%','#d6a18d'],['Hair Stylist','2%','#ac8a76'],['Transport','1%','#c7a996'],['Cake','2%','#e3aa5f'],['Traditional Dancers','1%','#ad8291'],['Sound System','1%','#778d80'],['Music Band','1%','#8292a8'],['DJ','2%','#9a8caf'],['MC','1%','#c49b72'],['Wedding Services & Protocol','2%','#9d927b'],['Drinks & Beverage Service','2%','#8197a2'],['Lighting, Screens & Stage','2%','#768b9b'],['Rings, Gifts & Souvenirs','2%','#bc9460'],['Stationery & Invitations','1%','#b495a2'],['Other Costs','2%','#d69c75'],['Emergency Reserve','1%','#d6b660'],
];
const vendorNeedCategories: Record<string, string[]> = {
  Venue: ['Venue'], 'Venue or meeting room': ['Venue'], Catering: ['Catering'], 'Catering or refreshments': ['Catering'], 'Photography & video': ['Photography & Video'],
  Decoration: ['Decoration'], 'Decoration, tables, chairs & tents': ['Decoration'], Flowers: ['Florist & Flowers'],
  'Decorator (includes tables, chairs & tents)': ['Decoration'], Florist: ['Florist & Flowers'],
  'Wedding attire': ['Decoration'], 'Makeup & hair': ['Makeup Artist', 'Hair Stylist'], Transport: ['Transport'], Cake: ['Cake'],
  'Sound system or music': ['Sound System', 'Music Band', 'DJ'], 'MC or facilitator': ['MC'],
  'Music & entertainment': ['Sound System', 'Music Band', 'DJ', 'MC'], Drinks: ['Drinks & Beverage Service'], 'Drinks & beverages': ['Drinks & Beverage Service'],
  'Church services': ['Other Costs'], 'Traditional dancers / Itorero': ['Traditional Dancers'],
  'Wedding services & protocol': ['Wedding Services & Protocol'], 'Stationery & invitations': ['Stationery & Invitations'], 'Invitations or stationery': ['Stationery & Invitations'],
  Accommodation: ['Other Costs'], Other: ['Other Costs'],
};

function IllustrativeBudgetPlan({ profile, user, recommendations, plan }: { profile: WeddingProfile; user: User | null; recommendations: CoupleVendorRecommendation[]; plan: NonNullable<CoupleWorkspace['plan']> }) {
  const { t } = useLanguage();
  const [availability, setAvailability] = useState<CoupleVendorAvailability[]>([]);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  useEffect(() => {
    if (!user) { setAvailability([]); setAvailabilityLoaded(false); return; }
    setAvailabilityLoaded(false);
    void fetch('/api/couple/vendor-availability').then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load vendor availability.');
      setAvailability(data.vendors ?? []);
    }).catch(() => setAvailability([])).finally(() => setAvailabilityLoaded(true));
  }, [user?.id, profile.weddingDate, profile.vendorNeeds?.join('|')]);
  const selectedNeeds = profile.vendorNeeds ?? [];
  const requestedCategories = new Set(selectedNeeds.flatMap((need) => vendorNeedCategories[need] ?? []));
  const rows = user && selectedNeeds.length ? illustrativeRows.filter(([category]) => requestedCategories.has(category)) : illustrativeRows;
  return <section className="allocation-card"><div className="card-heading"><h2>{selectedNeeds.length ? 'Your illustrative budget plan' : 'Illustrative budget plan'}</h2><span className="category-count">{rows.length} categories</span></div><div className="illustrative-calculated-total"><span>Total calculated by your planning team</span><strong>{Number(plan.plannedTotalRwf).toLocaleString()} RWF</strong><small>{plan.status === 'approved' ? 'Approved plan' : plan.status === 'rejected' ? 'Changes requested' : 'Under review'}</small></div><div className="allocation-list">{rows.map(([label, percent, color]) => {
    const match = recommendations.find((item) => item.category.toLowerCase() === label.toLowerCase());
    const budgetAmount = profile.budgetRwf ? Math.round(Number(profile.budgetRwf) * parseFloat(percent) / 100) : 0;
    const vendorAmount = match?.vendor ? Number(match.vendor.effectivePriceRwf) : null;
    const matchNote = match?.hasPricedVendor ? 'Priced vendors exceed this category budget' : 'Our team is finding a match';
    const availabilityStatus = match?.vendor ? availability.find((item) => item.vendorId === match.vendor!.id)?.availabilityStatus : undefined;
    return <div className={`allocation-row ${match?.hasPricedVendor && !match.vendor ? 'over-target' : ''}`} key={label}><span className="dot" style={{ background: color }} /><span>{label}{match?.vendor ? <><small className="recommended-vendor-name">{match.vendor.businessName}</small>{match.vendor.agreedPriceRwf !== null && <small className="recommended-vendor-name">Agreed price: {money(vendorAmount)}{label === 'Makeup Artist' && match.vendor.agreedPriceQuantity ? ` (${match.vendor.agreedPriceQuantity} people)` : ''}</small>}<small className={`illustrative-availability ${availabilityStatus ?? (availabilityLoaded ? 'not_checked' : 'loading')}`}>{t('Availability')}: {t(availabilityStatus ? coupleAvailabilityLabel[availabilityStatus] : availabilityLoaded ? 'Not checked' : 'Loading status…')}</small></> : user && selectedNeeds.length && requestedCategories.has(label) ? <small className="vendor-match-pending">{t(matchNote)}</small> : label === 'Other Costs' && profile.otherCostsDescription ? <small className="custom-cost-detail">{profile.otherCostsDescription}</small> : null}</span><b>{vendorAmount !== null ? money(vendorAmount) : profile.budgetRwf ? money(budgetAmount) : '—'}{vendorAmount !== null && <small className="budget-target-note">{vendorAmount <= budgetAmount ? 'Fits category allowance' : 'Above category allowance'}</small>}</b><span className="percentage">{percent}</span></div>;
  })}{user && selectedNeeds.length > 0 && rows.length === 0 && <div className="admin-empty">No budget categories match the selected services yet.</div>}</div><p className="allocation-note">{selectedNeeds.length ? 'Vendor quotes are checked against each category’s share of your total budget, including per-guest costs. If no priced vendor fits, your team can review the quote or source another option.' : 'Suggested starting percentages. Your planning team can adjust them to your priorities.'}</p></section>;
}

function GuestWorkspace({ onAuth, onContact }: { onAuth: (mode: AuthMode) => void; onContact: () => void }) {
  const { t } = useLanguage();
  return <section className="couple-page-panel"><header className="couple-page-heading"><div><span className="eyebrow">{t('YOUR EVENT WORKSPACE')}</span><h2>{t('Sign in to see your plan')}</h2><p>{t('Your budget, checklist, inspiration, contracts, and payment records are private to your account.')}</p></div></header><div className="guest-workspace-actions"><button className="admin-primary" onClick={() => onAuth('login')}>{t('Sign in')}</button><button className="subtle-action" onClick={() => onAuth('register')}>{t('Create an account')}</button></div><div className="guest-contact-preview"><div><b>Questions before you get started?</b><p>Talk to our event planning team or send us a message.</p></div><ContactDetails className="guest-contact-details" /><button className="subtle-action" onClick={onContact}>Send us a message</button></div></section>;
}

function CoupleWorkspaceSections({ workspace, page, budgetStatus }: { workspace: CoupleWorkspace | null; page: 'Budget' | 'Contracts' | 'Payments'; budgetStatus?: WeddingProfile['budgetStatus'] }) {
  const { t } = useLanguage();
  const amount = (value: number | string) => `${Number(value).toLocaleString()} RWF`;
  const plan = workspace?.plan;
  return <div className="couple-workspace-sections">
    {page === 'Budget' && <section className="account-plan-panel"><div className="account-section-heading"><div><span className="eyebrow">{t('YOUR WEDDING PLAN')}</span><h2>{t('Budget proposal')}</h2></div><span className={`plan-state ${budgetStatus ?? plan?.status ?? 'pending'}`}>{budgetStatus === 'pending' || !plan ? 'Pending' : budgetStatus === 'proposed' ? 'Under review' : budgetStatus === 'changes_requested' ? 'Changes requested' : 'Approved'}</span></div>
      {budgetStatus === 'pending' ? <p>Your budget request is pending. Our planning team will review your details and prepare a proposal.</p> : !plan ? <p>{t('Your planning team will share a detailed budget proposal here.')}</p> : plan.status !== 'approved' ? <><p>{plan.status === 'proposed' ? 'Your planning team is reviewing the proposed allocations.' : 'Your planning team requested changes to this proposal.'}</p>{plan.reviewNote && <small className="budget-review-note">Planner note: {plan.reviewNote}</small>}</> : <><div className="account-plan-total"><span>Approved plan estimate</span><b>{amount(plan.plannedTotalRwf)}</b><small>Requested budget {amount(plan.requestedBudgetRwf)} ? Plan v{plan.version}</small></div><div className="account-allocation-list">{plan.allocations.map((item) => <div key={item.category}><span>{item.category}<small>{item.vendorName ? `Recommended: ${item.vendorName}` : 'Planning allocation'}</small></span><b>{amount(item.plannedAmountRwf)}</b></div>)}</div></>}
    </section>}
    {page === 'Contracts' && <section className="account-record-panel"><div className="account-section-heading"><div><span className="eyebrow">{t('YOUR AGREEMENTS')}</span><h2>{t('Contracts')}</h2></div><FileCheck2 size={18} /></div>{workspace?.contracts.length ? <div className="account-record-list">{workspace.contracts.map((contract) => <article key={contract.id}><div><b>{contract.title}</b><span>{contract.vendorName} ? {contract.signatureStatus.replaceAll('_', ' ')}</span><small>{amount(contract.amountRwf)} ? {amount(contract.paidRwf)} paid ? {amount(contract.balanceRwf)} remaining</small></div><a href={`/api/couple/contracts/${contract.id}/document`}><Download size={14} /> Contract</a></article>)}</div> : <p>{t('No vendor contracts have been shared with your account yet.')}</p>}</section>}
    {page === 'Payments' && <section className="account-record-panel"><div className="account-section-heading"><div><span className="eyebrow">{t('PAYMENT SCHEDULE')}</span><h2>{t('Payments')}</h2></div><CircleDollarSign size={18} /></div>{workspace?.payments.length ? <div className="account-record-list">{workspace.payments.map((payment) => <article key={`${payment.contractTitle}-${payment.vendorName}-${payment.dueDate}-${payment.paidDate}`}><div><b>{payment.vendorName} ? {payment.paymentType}</b><span>{payment.contractTitle} ? {payment.status}</span><small>{amount(payment.amountRwf)} ? {payment.status === 'paid' ? `Paid ${payment.paidDate ?? ''}` : `Due ${payment.dueDate ?? 'date to be confirmed'}`}</small></div>{Boolean(payment.hasEvidence) && <a href={`/api/couple/payments/${payment.id}/evidence`}><Download size={14} /> Receipt</a>}</article>)}</div> : <p>{t('No vendor payments have been recorded yet.')}</p>}</section>}
  </div>;
}

function Summary({ Icon, label, value }: { Icon: LucideIcon; label: string; value: string }) { const { t } = useLanguage(); return <div className="summary-item"><Icon size={18} strokeWidth={1.6} /><div><span>{t(label)}</span><b>{t(value)}</b></div></div>; }
type AuthScreenProps = { mode: AuthMode; setMode: Dispatch<SetStateAction<AuthMode>>; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; notice: string; onBack: () => void };
function AuthScreen({ mode, setMode, onSubmit, busy, notice, onBack }: AuthScreenProps) {
  const { t } = useLanguage();
  const [show, setShow] = useState(false);
  return <main className="auth-page">
    <div className="auth-language"><LanguagePicker /></div>
    <Brand className="auth-brand" onClick={(event) => { event.preventDefault(); onBack(); }} />
    <div className="auth-card">
      <div className="auth-flower"><Sparkles size={21} /></div>
      <span className="eyebrow">{t('A LITTLE MORE ORGANIZED, A LOT MORE YOU')}</span>
      <h1>{t(mode === 'register' ? 'Your day starts here.' : 'Welcome back.')}</h1>
      <p className="auth-intro">{t(mode === 'register' ? 'Create your account and keep every event detail close.' : 'Sign in to pick up where you left off.')}</p>
      <form onSubmit={onSubmit}>
        {mode === 'register' && <label>{t('Your name')}<input name="name" placeholder="e.g. Aline Uwase" autoComplete="name" required minLength={2} maxLength={80} /></label>}
        <label>{t('Email address')}<input name="email" type="email" pattern={String.raw`[^\s@]+@[^\s@]+\.[^\s@]{2,}`} title="Enter a valid email address, such as name@example.com." placeholder="you@example.com" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} required /></label>
        <label>{t('Password')}<span className="password-field">
          <input name="password" type={show ? 'text' : 'password'} placeholder={t(mode === 'register' ? 'At least 10 characters' : 'Your password')} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={mode === 'register' ? 10 : 1} required />
          <button type="button" aria-label={t(show ? 'Hide password' : 'Show password')} onClick={() => setShow(!show)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
        </span>{mode === 'register' ? <small>{t('Use at least 10 characters to keep your account secure.')}</small> : <small>{t('Passwords are case-sensitive. Use the same password you chose when creating your account.')}</small>}</label>
        {notice && <p className="form-error">{notice}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? t('One moment…') : mode === 'register' ? t('Create my account') : t('Sign in')} <ChevronRight size={17} /></button>
      </form>
      <p className="auth-switch">{t(mode === 'register' ? 'Already have an account?' : 'New to The EventNest?')} <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); }}>{t(mode === 'register' ? 'Sign in' : 'Create an account')}</button></p>
      <button className="back-link" onClick={onBack}>{t('Back to your event plan')}</button>
      <div className="auth-note"><ShieldCheck size={15} /> {t('Your details are kept private and secure.')}</div>
      <div className="auth-contact"><b>Need help?</b><ContactDetails className="auth-contact-details" /></div>
    </div>
    <div className="auth-bottom">{t('A thoughtful beginning to your forever')} <Heart size={13} /></div>
  </main>;
}

function AdminShell({ user, onSignOut, darkTheme, onToggleTheme }: { user: User; onSignOut: () => Promise<void>; darkTheme: boolean; onToggleTheme: () => void }) {
  return <AdminDashboard user={user} onSignOut={onSignOut} darkTheme={darkTheme} onToggleTheme={onToggleTheme} />;
}
