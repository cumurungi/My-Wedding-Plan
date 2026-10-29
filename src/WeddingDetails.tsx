import { useState, type FormEvent } from 'react';
import { CalendarDays, ChevronRight, Heart, MapPin, Sparkles, Users, Wallet } from 'lucide-react';
import type { User, WeddingDetails, WeddingProfile } from './wedding';
import { eventTypeLabels, type EventType, type PackageCode } from '../shared/package-plans';
import Brand from './Brand';
import { LanguagePicker, useLanguage } from './i18n';

type Props = {
  user: User;
  profile: WeddingProfile;
  packageCode: PackageCode;
  busy: boolean;
  error: string;
  onSave: (details: WeddingDetails) => Promise<void>;
};

const today = new Date();
const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

export default function WeddingDetailsForm({ user, profile, packageCode, busy, error, onSave }: Props) {
  const { t } = useLanguage();
  const isShortEventPlan = packageCode === 'event_short';
  const [eventType, setEventType] = useState<EventType>(
    isShortEventPlan && profile.eventType && profile.eventType !== 'wedding' ? profile.eventType : isShortEventPlan ? 'birthday' : 'wedding',
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void onSave({
      eventType: String(values.get('eventType') ?? (isShortEventPlan ? 'birthday' : 'wedding')) as EventType,
      eventName: String(values.get('eventName') ?? '').trim(),
      budgetRwf: Number(values.get('budgetRwf')),
      guestCount: Number(values.get('guestCount')),
      contactPhone: String(values.get('contactPhone') ?? '').trim(),
      weddingDate: String(values.get('weddingDate') ?? ''),
      location: String(values.get('location') ?? '').trim(),
      style: String(values.get('style') ?? ''),
      weddingFormat: String(values.get('weddingFormat') ?? 'other') as WeddingDetails['weddingFormat'],
      vendorNeeds: values.getAll('vendorNeeds').map(String),
      specialRequirements: String(values.get('specialRequirements') ?? '').trim(),
      otherCostsDescription: String(values.get('otherCostsDescription') ?? '').trim(),
    });
  }

  return <main className="details-page"><div className="details-language"><LanguagePicker /></div>
    <Brand className="details-brand" />
    <section className="details-card">
      <div className="details-intro">
        <div className="auth-flower"><Sparkles size={21} /></div>
        <span className="eyebrow">{t('A few details to get started')}</span>
        <h1>{isShortEventPlan ? 'Tell us about your event' : t('Tell us about your day')}, {user.name.split(' ')[0]}.</h1>
        <p>{t('Share the essentials. Your planning team will use them to understand what matters to you and prepare a thoughtful plan.')}</p>
      </div>
      <form className="details-form" onSubmit={submit}>
        <div className="details-form-grid">
          {isShortEventPlan ? <label><span>Event type</span><select name="eventType" value={eventType} onChange={(event) => setEventType(event.target.value as EventType)}>{Object.entries(eventTypeLabels).filter(([value]) => value !== 'wedding').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>Select the occasion you are planning.</small></label> : <input type="hidden" name="eventType" value="wedding" />}
          {isShortEventPlan && <label><span>Event name <em>{eventType === 'other' ? 'Please specify' : 'Optional'}</em></span><input name="eventName" type="text" maxLength={120} placeholder={eventType === 'other' ? 'e.g. Graduation dinner' : 'e.g. Aline’s baby shower'} defaultValue={profile.eventName ?? ''} required={eventType === 'other'} /></label>}
          <label><span><Wallet size={15} /> {isShortEventPlan ? 'Event budget' : t('Wedding budget')} <em>RWF</em></span><input name="budgetRwf" type="number" min="1" max="10000000000000" step="10000" placeholder="10,000,000" defaultValue={profile.budgetRwf ?? ''} required /><small>{t('Your total budget for the celebration.')}</small></label>
          <label><span><Users size={15} /> {t('Guest count')}</span><input name="guestCount" type="number" min="1" max="100000" step="1" placeholder="150" defaultValue={profile.guestCount ?? ''} required /><small>{t('An estimate is perfectly fine.')}</small></label>
          <label><span>{t('Phone number')} <em>{t('Optional')}</em></span><input name="contactPhone" type="tel" maxLength={40} autoComplete="tel" placeholder="+250 7xx xxx xxx" defaultValue={profile.contactPhone ?? ''} /><small>{t('Share a number if you would like our team to contact you about your budget.')}</small></label>
          <label><span><CalendarDays size={15} /> {isShortEventPlan ? 'Event date' : t('Wedding date')} <em>{t('Optional')}</em></span><input name="weddingDate" type="date" min={todayLocal} defaultValue={profile.weddingDate ?? ''} /><small>{t('Still deciding? You can add it later.')}</small></label>
          <label><span><MapPin size={15} /> {t('Location')}</span><input name="location" type="text" minLength={2} maxLength={160} placeholder="Kigali, Rwanda" defaultValue={profile.location ?? ''} required /><small>{t('City, district, or preferred area.')}</small></label>
          <label className="details-wide"><span><Sparkles size={15} /> {isShortEventPlan ? 'Event style' : t('Wedding style')} <em>{t('Optional')}</em></span><select name="style" defaultValue={profile.style ?? ''}><option value="">{t('We are still exploring')}</option><option>{t('Classic and elegant')}</option><option>{t('Garden romance')}</option><option>{t('Modern and minimal')}</option><option>{t('Cultural celebration')}</option><option>{t('Destination wedding')}</option><option>{t('Other')}</option></select></label>
          {!isShortEventPlan && <fieldset className="details-wide wedding-format-field"><legend>{t('What will your celebration include?')}</legend><p>{t('Select the ceremony and celebration format that fits your plans.')}</p><div className="wedding-format-options">{[['traditional_church_reception', 'Traditional + church + reception', 'Traditional ceremony followed by church ceremony and reception'], ['church_reception', 'Church + reception', 'Church ceremony followed by a reception'], ['traditional_only', 'Traditional celebration', 'Traditional ceremony and celebration'], ['other', 'Other or still deciding', 'We can update these details later']].map(([value, title, detail]) => <label key={value}><input type="radio" name="weddingFormat" value={value} defaultChecked={profile.weddingFormat ? profile.weddingFormat === value : value === 'other'} /><span><b>{t(title)}</b><small>{t(detail)}</small></span></label>)}</div></fieldset>}
          <fieldset className="details-wide vendor-needs-field"><legend>{isShortEventPlan ? 'What services might you need?' : t('Which vendors or services may you need?')}</legend><p>{t('Choose any that apply, or leave all unselected. Your planning team is already part of this service.')}</p><div className="vendor-needs-options">{(isShortEventPlan ? ['Venue or meeting room', 'Catering or refreshments', 'Decoration, tables, chairs & tents', 'Photography & video', 'Flowers', 'Sound system or music', 'Cake', 'Drinks', 'MC or facilitator', 'Invitations or stationery', 'Other'] : ['Venue', 'Catering', 'Photography & video', 'Decorator (includes tables, chairs & tents)', 'Florist', 'Wedding attire', 'Makeup & hair', 'Transport', 'Cake', 'Music & entertainment', 'Drinks & beverages', 'Church services', 'Traditional dancers / Itorero', 'Wedding services & protocol', 'Stationery & invitations', 'Accommodation', 'Other']).map((vendor) => <label key={vendor}><input type="checkbox" name="vendorNeeds" value={vendor} defaultChecked={profile.vendorNeeds?.includes(vendor)} /><span>{vendor}</span></label>)}</div></fieldset>
          <label className="details-wide"><span>{t('What matters most to you?')} <em>{t('Optional')}</em></span><textarea name="specialRequirements" rows={4} maxLength={5000} placeholder={t('Share any traditions, accessibility needs, priorities, or ideas you already have in mind.')} defaultValue={profile.specialRequirements ?? ''} /><small>{t('This helps the planning team understand your priorities.')}</small></label>
          <label className="details-wide"><span>Other costs to include <em>Optional</em></span><input name="otherCostsDescription" type="text" maxLength={500} placeholder="e.g. Marriage license, gifts, stationery" defaultValue={profile.otherCostsDescription ?? ''} /><small>Name any expenses you want your planning team to include in the Other costs category.</small></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="details-form-footer"><p><Heart size={14} /> {t('Your details are private and only shared with your planning team.')}</p><button className="auth-submit" disabled={busy}>{busy ? t('Saving your details…') : isShortEventPlan ? 'Save event details' : t('Save wedding details')} <ChevronRight size={17} /></button></div>
      </form>
    </section>
    <p className="details-footnote">{t('You can update your details at any time.')}</p>
  </main>;
}
