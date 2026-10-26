import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Bookmark, Image, Lightbulb, Palette, Pencil, Plus, RefreshCw, Search, Sparkles, Tag, X, Store } from 'lucide-react';

type InspirationType = 'theme' | 'palette' | 'decoration' | 'idea';
type Inspiration = { id: number; title: string; itemType: InspirationType; vendorCategory: string | null; priceRwf: number | string | null; description: string; colorPalette: string | null; imageUrl: string | null; isPublished: boolean | number; createdAt: string; updatedAt: string };
type InspirationVendor = { id: number; businessName: string; category: string; location: string; serviceDescription: string | null; colorPalette: string | null; imageUrl: string | null; priceFromRwf: number | string | null; priceToRwf: number | string | null; pricingBasis: 'fixed' | 'per_guest' };
const typeLabels: Record<InspirationType, string> = { theme: 'Wedding theme', palette: 'Color palette', decoration: 'Decoration reference', idea: 'Planning idea' };
const types: InspirationType[] = ['theme', 'palette', 'decoration', 'idea'];

async function readApiResponse<T extends Record<string, unknown>>(response: Response): Promise<T & { error?: string }> {
  const body = await response.text();
  if (!body) throw new Error(`The server returned an empty response (HTTP ${response.status}). Check that the API server is running.`);
  try { return JSON.parse(body) as T & { error?: string }; }
  catch { throw new Error(`The server returned an unexpected response (HTTP ${response.status}). Check the API server.`); }
}

export default function InspirationPage({ onNotify }: { onNotify: (message: string) => void }) {
  const [items, setItems] = useState<Inspiration[]>([]);
  const [vendors, setVendors] = useState<InspirationVendor[]>([]);
  const [showVendors, setShowVendors] = useState(false);
  const [selectedVendorCategory, setSelectedVendorCategory] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | InspirationType>('all');
  const [publicationFilter, setPublicationFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [search, setSearch] = useState('');
  const [paletteFilter, setPaletteFilter] = useState<'all' | 'with-colors' | 'without-colors'>('all');
  const [sortBy, setSortBy] = useState<'latest' | 'title'>('latest');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [editor, setEditor] = useState<Inspiration | 'new' | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/inspiration');
      const data = await readApiResponse<{ items: Inspiration[] }>(response);
      if (!response.ok) throw new Error(String(data.error || 'Could not load inspiration ideas.'));
      setItems(data.items);
      setSelectedId((current) => current ?? data.items[0]?.id ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load inspiration ideas.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void fetch('/api/admin/vendors?status=all').then(async (response) => { const data = await readApiResponse<{ vendors: InspirationVendor[] }>(response); if (!response.ok) throw new Error(String(data.error || 'Could not load vendor services.')); setVendors(data.vendors ?? []); }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load vendor services.')); }, []);

  const filtered = useMemo(() => items.filter((item) =>
    (typeFilter === 'all' || item.itemType === typeFilter) &&
    (publicationFilter === 'all' || (publicationFilter === 'published' ? Boolean(item.isPublished) : !item.isPublished)) &&
    (paletteFilter === 'all' || (paletteFilter === 'with-colors' ? Boolean(item.colorPalette) : !item.colorPalette)) &&
    `${item.title} ${item.description}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => sortBy === 'title' ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)),
  [items, typeFilter, publicationFilter, paletteFilter, search, sortBy]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const publishedCount = items.filter((item) => Boolean(item.isPublished)).length;
  const draftCount = items.length - publishedCount;
  const imageCount = items.filter((item) => Boolean(item.imageUrl)).length;
  useEffect(() => { if (detailOpen && selected && selected.id !== selectedId) setSelectedId(selected.id); }, [detailOpen, selected, selectedId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set('isPublished', form.get('isPublished') === 'on' ? 'true' : 'false');
    setSaving(true); setError('');
    try {
      const editing = editor !== 'new' && editor !== null;
      const response = await fetch(editing ? `/api/admin/inspiration/${editor.id}` : '/api/admin/inspiration', {
        method: editing ? 'PUT' : 'POST', body: form,
      });
      const data = await readApiResponse<{ id: number }>(response);
      if (!response.ok) throw new Error(String(data.error || 'Could not save this inspiration item.'));
      setEditor(null); setSelectedId(editing ? editor.id : data.id); setDetailOpen(true); onNotify(editing ? 'Inspiration item updated.' : 'Inspiration item added.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this inspiration item.'); }
    finally { setSaving(false); }
  }

  async function togglePublish(item: Inspiration) {
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/admin/inspiration/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: item.title, itemType: item.itemType, vendorCategory: item.vendorCategory ?? '', priceRwf: item.priceRwf ?? null, description: item.description, colorPalette: item.colorPalette ?? '', isPublished: !item.isPublished }) });
      const data = await readApiResponse<Record<string, unknown>>(response);
      if (!response.ok) throw new Error(String(data.error || 'Could not update publication status.'));
      onNotify(item.isPublished ? 'Inspiration board moved to drafts.' : 'Inspiration board published.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update publication status.'); }
    finally { setSaving(false); }
  }

  const boardTabs = [['all', 'All boards'], ['theme', 'Themes'], ['palette', 'Color palettes'], ['decoration', 'Decoration ideas'], ['idea', 'Planning ideas']] as const;
  const colors = selected?.colorPalette?.split(',').map((color) => color.trim()).filter(Boolean) ?? [];
  return <div className="inspiration-dashboard">
    <div className="inspiration-page-heading"><div><h2>Inspiration</h2><p>Manage inspiration boards, themes, and ideas for couples.</p></div><div className="inspiration-page-actions"><label className="inspiration-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inspiration…" /></label><button className="admin-primary" onClick={() => { setError(''); setEditor('new'); }}><Plus size={15} /> Create inspiration board</button></div></div>
    <div className="inspiration-stats"><article><span><Lightbulb size={19} /></span><div><small>Total boards</small><b>{items.length}</b><em>In your library</em></div></article><article><span className="public"><Bookmark size={19} /></span><div><small>Public boards</small><b>{publishedCount}</b><em>Visible to couples</em></div></article><article><span className="draft"><Palette size={19} /></span><div><small>Draft boards</small><b>{draftCount}</b><em>Only visible to admins</em></div></article><article><span className="images"><Image size={19} /></span><div><small>Boards with images</small><b>{imageCount}</b><em>Across the library</em></div></article></div>
    {error && <div className="admin-alert">{error}</div>}
    <div className="inspiration-library-switch"><button className={!showVendors ? 'active' : ''} onClick={() => { setShowVendors(false); setSelectedVendorCategory(null); }}>Inspiration boards</button><button className={showVendors ? 'active' : ''} onClick={() => { setShowVendors(true); setDetailOpen(false); }}>Vendor categories <span>{new Set(vendors.map((vendor) => vendor.category)).size}</span></button></div>
    {showVendors ? <section className="admin-panel inspiration-vendor-browser">{selectedVendorCategory ? <><header><button className="inspiration-back" onClick={() => setSelectedVendorCategory(null)}>← All categories</button><div><h3>{selectedVendorCategory} inspiration</h3><p>Add examples for couples to browse in this category.</p></div><button className="admin-primary" onClick={() => { setEditor('new'); setError(''); }}> <Plus size={14} /> Add inspiration board</button></header>{items.filter((item) => item.vendorCategory === selectedVendorCategory || (!item.vendorCategory && selectedVendorCategory === 'Decoration')).length ? <div className="inspiration-vendor-grid">{items.filter((item) => item.vendorCategory === selectedVendorCategory || (!item.vendorCategory && selectedVendorCategory === 'Decoration')).map((item) => <article key={item.id}><div className="inspiration-vendor-image">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Image size={24} />}</div><div><small>{item.isPublished ? 'Published for couples' : 'Draft'}</small><h3>{item.title}</h3><p>{item.description || 'No description added yet.'}</p>{item.colorPalette && <div className="inspiration-vendor-colors">{item.colorPalette.split(',').map((color) => color.trim()).filter(Boolean).map((color) => <i key={color} title={color} style={{ backgroundColor: color }} />)}<small>{item.colorPalette}</small></div>}{item.priceRwf != null && <b>{Number(item.priceRwf).toLocaleString()} RWF</b>}<button className="subtle-action" onClick={() => setEditor(item)}>Edit board</button></div></article>)}</div> : <div className="admin-empty">No inspiration boards in this category yet. Add a photo, name, price, and colors for couples.</div>}</> : <div className="inspiration-vendor-category-grid">{[...new Set([...vendors.map((vendor) => vendor.category), 'Venue', 'Catering', 'Decoration', 'Florist & Flowers', 'Photography & Video'])].sort().map((category) => { const group = items.filter((item) => item.vendorCategory === category || (!item.vendorCategory && category === 'Decoration')); const cover = group.find((item) => item.imageUrl); return <button key={category} onClick={() => setSelectedVendorCategory(category)}><div>{cover?.imageUrl ? <img src={cover.imageUrl} alt="" /> : <Store size={28} />}<span>{group.length} inspiration boards</span></div><h3>{category}</h3><small>Add or manage category ideas →</small></button>; })}</div>}</section> : <div className={`inspiration-workspace ${detailOpen && selected ? 'with-detail' : ''}`}>
      <section className="admin-panel inspiration-browser"><div className="inspiration-board-tabs">{boardTabs.map(([value, label]) => { const count = value === 'all' ? items.length : items.filter((item) => item.itemType === value).length; return <button key={value} className={typeFilter === value ? 'active' : ''} onClick={() => setTypeFilter(value)}>{label}<span>{count}</span></button>; })}</div>
        <div className="inspiration-board-filters"><label><Tag size={14} /><select aria-label="Filter by palette" value={paletteFilter} onChange={(event) => setPaletteFilter(event.target.value as typeof paletteFilter)}><option value="all">All color palettes</option><option value="with-colors">Has colors</option><option value="without-colors">No colors</option></select></label><label><Sparkles size={14} /><select aria-label="Filter publication status" value={publicationFilter} onChange={(event) => setPublicationFilter(event.target.value as typeof publicationFilter)}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Drafts</option></select></label><label className="inspiration-sort">Sort by<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="latest">Latest</option><option value="title">Title</option></select></label><button className="subtle-action" onClick={() => void load()}><RefreshCw size={13} /> Refresh</button></div>
        {loading ? <div className="admin-empty">Loading inspiration boards…</div> : filtered.length ? <div className="inspiration-board-grid">{filtered.map((item) => <article className={`inspiration-board-card ${selected?.id === item.id && detailOpen ? 'selected' : ''}`} key={item.id}>
          <button className="inspiration-board-select" onClick={() => { setSelectedId(item.id); setDetailOpen(true); }} aria-label={`View ${item.title}`}><div className="inspiration-board-image">{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <div><Image size={25} /><span>{typeLabels[item.itemType]}</span></div>}<span className={`inspiration-publication ${item.isPublished ? 'published' : 'draft'}`}>{item.isPublished ? 'Published' : 'Draft'}</span><span className="inspiration-bookmark"><Bookmark size={15} /></span></div><div className="inspiration-board-content">{item.colorPalette && <div className="inspiration-swatches">{item.colorPalette.split(',').map((color) => color.trim()).filter(Boolean).slice(0, 5).map((color) => <i key={color} style={{ backgroundColor: color }} />)}</div>}<div className="inspiration-title-line"><h3>{item.title}</h3><span className={`inspiration-trend ${item.isPublished ? 'published' : 'draft'}`}>{item.isPublished ? 'Public' : 'Draft'}</span></div><p>{item.description || 'No description added yet.'}</p><div className="inspiration-card-meta"><span><Bookmark size={13} /> {item.isPublished ? 'Public' : 'Draft'}</span><span>{typeLabels[item.itemType]}</span><span>{new Date(item.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div></div></button><footer className="inspiration-card-actions"><button className="subtle-action" onClick={() => setEditor(item)}>Edit board</button><button className="subtle-action" onClick={() => void togglePublish(item)} disabled={saving}>{item.isPublished ? 'Unpublish' : 'Publish'}</button></footer>
        </article>)}</div> : <div className="admin-empty inspiration-no-results"><div><b>{items.length ? 'No inspiration boards match these filters' : 'Start your inspiration library'}</b><p>{items.length ? 'Try another search or filter.' : 'Create a board for wedding themes, palettes, or decoration ideas.'}</p></div><button className="admin-primary" onClick={() => setEditor('new')}><Plus size={15} /> Create board</button></div>}
      </section>
      {detailOpen && selected && <aside className="admin-panel inspiration-board-detail"><header><button className="inspiration-back" onClick={() => setDetailOpen(false)}>← Back to all boards</button><button className="modal-close" aria-label="Close details" onClick={() => setDetailOpen(false)}><X size={17} /></button></header><div className="inspiration-detail-hero">{selected.imageUrl ? <img src={selected.imageUrl} alt="" /> : <div><Image size={28} /><span>{typeLabels[selected.itemType]}</span></div>}<span className={`inspiration-publication ${selected.isPublished ? 'published' : 'draft'}`}>{selected.isPublished ? 'Published' : 'Draft'}</span></div><div className="inspiration-detail-body"><div className="inspiration-detail-title"><h3>{selected.title}</h3><span className="inspiration-trend published">{selected.isPublished ? 'Public' : 'Private'}</span></div><p>{selected.description || 'No description added yet.'}</p><div className="inspiration-detail-facts"><div><span>Category</span><b>{typeLabels[selected.itemType]}</b></div><div><span>Last updated</span><b>{new Date(selected.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</b></div></div>{colors.length > 0 && <section className="inspiration-detail-colors"><h4>Primary colors</h4><div>{colors.map((color) => <span key={color} title={color} style={{ backgroundColor: color }} />)}</div></section>}<div className="inspiration-detail-actions"><button className="admin-primary" onClick={() => setEditor(selected)}>Edit board <Pencil size={14} /></button><button className="subtle-action" onClick={() => void togglePublish(selected)} disabled={saving}>{selected.isPublished ? 'Move to drafts' : 'Publish for couples'}</button></div></div></aside>}
    </div>}
    {editor && <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditor(null); }}><section className="vendor-modal inspiration-modal" role="dialog" aria-modal="true" aria-labelledby="inspiration-form-title"><header><div><span className="eyebrow">INSPIRATION LIBRARY</span><h2 id="inspiration-form-title">{editor === 'new' ? 'Create an inspiration board' : 'Edit inspiration board'}</h2></div><button className="modal-close" onClick={() => setEditor(null)} aria-label="Close"><X size={19} /></button></header><form onSubmit={(event) => void save(event)}><div className="vendor-form-grid"><label>Board title<input name="title" required minLength={2} maxLength={160} defaultValue={editor === 'new' ? '' : editor.title} placeholder="e.g. Kigali garden celebration" /></label><label>Category<select name="itemType" defaultValue={editor === 'new' ? 'theme' : editor.itemType}>{types.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></label><label>Vendor category<select name="vendorCategory" defaultValue={editor === 'new' ? selectedVendorCategory ?? '' : editor.vendorCategory ?? selectedVendorCategory ?? ''}><option value="">General inspiration</option>{[...new Set([...vendors.map((vendor) => vendor.category), 'Venue', 'Catering', 'Decoration', 'Florist & Flowers', 'Photography & Video'])].sort().map((category) => <option key={category}>{category}</option>)}</select></label><label>Display price <em>RWF</em><input name="priceRwf" type="number" min="0" max="10000000000000" step="1000" defaultValue={editor === 'new' ? '' : editor.priceRwf ?? ''} placeholder="Optional" /></label><label className="form-wide">Description<textarea name="description" rows={4} maxLength={5000} defaultValue={editor === 'new' ? '' : editor.description} placeholder="Describe the mood, style, or practical planning idea." /></label><label className="form-wide">Palette colors <em>Optional · up to six hex codes, separated by commas</em><input name="colorPalette" maxLength={255} defaultValue={editor === 'new' ? '' : editor.colorPalette ?? ''} placeholder="#F4E6D2, #263B35, #D99B87" /></label><label className="form-wide inspiration-upload-label">Cover image <em>JPG or PNG, up to 8 MB</em><input name="image" type="file" required={editor === 'new' ? Boolean(selectedVendorCategory) : Boolean(editor.vendorCategory && !editor.imageUrl)} accept="image/jpeg,image/png" />{editor !== 'new' && editor.imageUrl && <img className="inspiration-current-image" src={editor.imageUrl} alt="Current board cover" />} </label>{editor !== 'new' && editor.imageUrl && <label className="inspiration-publish-check"><input type="checkbox" name="removeImage" /> Remove current image</label>}<label className="inspiration-publish-check"><input type="checkbox" name="isPublished" defaultChecked={editor === 'new' ? Boolean(selectedVendorCategory) : Boolean(editor.isPublished)} /> Publish for couples</label></div>{error && <p className="form-error">{error}</p>}<footer><p><Palette size={14} /> Drafts stay in the admin library. Published boards are ready for couples to explore.</p><button className="admin-primary" disabled={saving}>{saving ? 'Saving…' : 'Save board'}</button></footer></form></section></div>}
  </div>;
}
