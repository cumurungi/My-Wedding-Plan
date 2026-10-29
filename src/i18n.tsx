import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Language = 'en' | 'fr' | 'rw';
const translations: Record<Language, Record<string, string>> = {
  en: {},
  fr: {
    'Language': 'Langue', 'English': 'Anglais', 'French': 'Français', 'Kinyarwanda': 'Kinyarwanda',
    'Budget': 'Budget', 'Packages': 'Forfaits', 'Checklist': 'Liste de tâches', 'Inspiration': 'Inspiration', 'Payments': 'Paiements', 'Contact': 'Contact',
    'Save plan': 'Enregistrer le plan', 'Share plan': 'Partager le plan', 'Sign out': 'Se déconnecter', 'Wedding account': 'Compte mariage',
    'Sign in': 'Se connecter', 'Create an account': 'Créer un compte', 'Create free account': 'Créer un compte gratuit', 'Edit details': 'Modifier les détails', 'Edit wedding details': 'Modifier les détails du mariage',
    'Your wedding plan overview': 'Aperçu de votre plan de mariage', 'Sign in to view your wedding details.': 'Connectez-vous pour voir les détails de votre mariage.',
    'See your budget, selected services, and planning proposal.': 'Consultez votre budget, les services choisis et la proposition de planification.',
    'Choose or review your paid wedding planning package.': 'Choisissez ou consultez votre forfait de planification de mariage.',
    'See your requested vendors and the progress your planning team has marked.': 'Consultez les prestataires demandés et l’avancement indiqué par votre équipe.',
    'Explore ideas and wedding inspiration shared with you.': 'Découvrez les idées et inspirations de mariage partagées avec vous.',
    'Review vendor contracts shared with your account.': 'Consultez les contrats des prestataires partagés avec votre compte.',
    'Track payments recorded against your vendor contracts.': 'Suivez les paiements liés à vos contrats avec les prestataires.',
    'Wedding budget': 'Budget du mariage', 'Guests': 'Invités', 'Location': 'Lieu', 'Wedding date': 'Date du mariage', 'people': 'personnes',
    'Your total budget': 'Votre budget total', 'Plan estimate': 'Estimation du plan', 'Awaiting plan': 'En attente du plan',
    'Your illustrative budget plan': 'Votre répartition budgétaire indicative', 'Illustrative budget plan': 'Répartition budgétaire indicative', 'categories': 'catégories',
    'Availability': 'Disponibilité', 'Not checked': 'Non vérifiée', 'Waiting for vendor': 'En attente du prestataire', 'Available': 'Disponible', 'Unavailable': 'Indisponible', 'Approved': 'Confirmée', 'Loading status…': 'Chargement du statut…',
    'Priced vendors exceed this category budget': 'Les tarifs des prestataires dépassent le budget de cette catégorie', 'Our team is finding a match': 'Notre équipe recherche un prestataire',
    'Suggested starting percentages. Your planning team can adjust them to your priorities.': 'Pourcentages indicatifs. Votre équipe peut les adapter à vos priorités.',
    'YOUR WEDDING WORKSPACE': 'VOTRE ESPACE MARIAGE', 'Sign in to see your plan': 'Connectez-vous pour voir votre plan',
    'Your budget, checklist, inspiration, contracts, and payment records are private to your account.': 'Votre budget, votre liste, vos inspirations, contrats et paiements sont privés à votre compte.',
    'Budget proposal': 'Proposition de budget', 'Under review': 'En cours d’examen', 'Your planning team will share a detailed budget proposal here.': 'Votre équipe partagera ici une proposition détaillée de budget.',
    'Contact us': 'Contactez-nous', 'Send a message to our wedding planning team.': 'Envoyez un message à notre équipe de planification.', 'Phone number': 'Numéro de téléphone',
    'Contracts': 'Contrats', 'No vendor contracts have been shared with your account yet.': 'Aucun contrat de prestataire n’a encore été partagé avec votre compte.',
    'PAYMENT SCHEDULE': 'ÉCHÉANCIER DES PAIEMENTS', 'No vendor payments have been recorded yet.': 'Aucun paiement de prestataire n’a encore été enregistré.',
    'A LITTLE MORE ORGANIZED, A LOT MORE YOU': 'MIEUX ORGANISÉ, TOUT EN VOUS RESSEMBLANT', 'Your day starts here.': 'Votre journée commence ici.', 'Welcome back.': 'Heureux de vous revoir.',
    'Create your account and keep every wedding detail close.': 'Créez votre compte et gardez chaque détail du mariage à portée de main.', 'Sign in to pick up where you left off.': 'Connectez-vous pour reprendre là où vous en étiez.',
    'Your name': 'Votre nom', 'Email address': 'Adresse e-mail', 'Password': 'Mot de passe', 'At least 10 characters': 'Au moins 10 caractères',
    'Use at least 10 characters to keep your account secure.': 'Utilisez au moins 10 caractères pour protéger votre compte.', 'Already have an account?': 'Vous avez déjà un compte ?', 'New to The EventNest?': 'Vous découvrez The EventNest ?', 'Event account': 'Compte événement',
    'Hide password': 'Masquer le mot de passe', 'Show password': 'Afficher le mot de passe', 'Your details are kept private and secure.': 'Vos informations restent privées et sécurisées.',
    'Create my account': 'Créer mon compte', 'One moment…': 'Un instant…', 'Back to your plan': 'Retour à votre plan',
    'Your guest count': 'Votre nombre d’invités', 'Your chosen location': 'Le lieu choisi', 'Your chosen date': 'La date choisie',
    'Fit category allowance': 'Dans le budget de la catégorie', 'No budget categories match the selected services yet.': 'Aucune catégorie budgétaire ne correspond encore aux services choisis.', 'Fits category allowance': 'Dans le budget prévu',
    'No specific services selected': 'Aucun service particulier sélectionné', 'A copy of your wedding plan was downloaded.': 'Une copie de votre plan de mariage a été téléchargée.', 'Plan summary and app link copied.': 'Le résumé du plan et le lien de l’application ont été copiés.',
    'Not set yet': 'Pas encore défini', 'Not set': 'Non défini', 'Your budget': 'Votre budget',
    'Venue': 'Lieu', 'Catering': 'Traiteur', 'Decoration': 'Décoration', 'Other Costs': 'Autres frais', 'Photography & Video': 'Photo et vidéo', 'Florist & Flowers': 'Fleurs et fleuriste', 'Attire': 'Tenue', 'Transport': 'Transport', 'Cake': 'Gâteau',
    'Overview': 'Vue d’ensemble', 'Budgets': 'Budgets', 'Vendors': 'Prestataires', 'Wedding plans': 'Plans de mariage', 'Checklists': 'Listes de tâches', 'Notifications': 'Notifications', 'Budget review': 'Examen du budget', 'Vendor management': 'Gestion des prestataires', 'Guest management': 'Gestion des invités', 'Inspiration library': 'Bibliothèque d’inspiration', 'Good morning': 'Bonjour', 'Secure administrator access': 'Accès administrateur sécurisé',
    'YOUR AGREEMENTS': 'VOS CONTRATS', 'Thoughtfully made for your day': 'Conçu avec soin pour votre journée',
    'Hello': 'Bonjour', 'A thoughtful beginning to your forever': 'Un beau début pour votre vie à deux',
    'Tell us about your day': 'Parlez-nous de votre journée', 'Share the essentials. Your planning team will use them to understand what matters to you and prepare a thoughtful plan.': 'Partagez les informations essentielles. Votre équipe les utilisera pour préparer un plan adapté à vos priorités.',
    'Your total budget for the celebration.': 'Votre budget total pour la célébration.', 'An estimate is perfectly fine.': 'Une estimation suffit.', 'Still deciding? You can add it later.': 'Vous hésitez encore ? Vous pourrez l’ajouter plus tard.', 'City, district, or preferred area.': 'Ville, district ou quartier souhaité.',
    'Optional': 'Facultatif', 'We are still exploring': 'Nous explorons encore les possibilités', 'Classic and elegant': 'Classique et élégant', 'Garden romance': 'Romance au jardin', 'Modern and minimal': 'Moderne et épuré', 'Cultural celebration': 'Célébration culturelle', 'Destination wedding': 'Mariage à destination', 'Other': 'Autre',
    'What will your celebration include?': 'Que comprendra votre célébration ?', 'Select the ceremony and celebration format that fits your plans.': 'Choisissez le format de cérémonie et de célébration qui vous convient.',
    'Traditional + church + reception': 'Traditionnel + église + réception', 'Traditional ceremony followed by church ceremony and reception': 'Cérémonie traditionnelle suivie de la cérémonie religieuse et de la réception', 'Church + reception': 'Église + réception', 'Church ceremony followed by a reception': 'Cérémonie religieuse suivie d’une réception', 'Traditional celebration': 'Célébration traditionnelle', 'Traditional ceremony and celebration': 'Cérémonie et célébration traditionnelles', 'Other or still deciding': 'Autre ou encore indécis', 'We can update these details later': 'Vous pourrez modifier ces détails plus tard',
    'What matters most to you?': 'Qu’est-ce qui compte le plus pour vous ?', 'Share any traditions, accessibility needs, priorities, or ideas you already have in mind.': 'Partagez vos traditions, besoins d’accessibilité, priorités ou idées.', 'This helps the planning team understand your priorities.': 'Cela aide votre équipe à comprendre vos priorités.', 'Which vendors or services may you need?': 'De quels prestataires ou services pourriez-vous avoir besoin ?', 'Choose any that apply, or leave all unselected. Your planning team is already part of this service.': 'Choisissez les options qui vous conviennent. Votre équipe de planification fait déjà partie du service.',
    'Your details are private and only shared with your planning team.': 'Vos informations restent privées et ne sont partagées qu’avec votre équipe.', 'Saving your details…': 'Enregistrement de vos informations…', 'You can update your details at any time.': 'Vous pouvez modifier vos informations à tout moment.',
    'YOUR WEDDING TASKS': 'VOS TÂCHES DE MARIAGE', 'See your requested vendor services and the progress your planning team has marked.': 'Consultez les services demandés et leur avancement.',
    'complete': 'terminées', 'Completed by your planning team': 'Terminé par votre équipe de planification', 'To do': 'À faire', 'Vendor not selected yet': 'Prestataire pas encore choisi',
    'Your selected vendor services will appear here.': 'Les services que vous avez choisis apparaîtront ici.', 'IDEAS FOR YOUR CELEBRATION': 'IDÉES POUR VOTRE CÉLÉBRATION', 'Browse the examples your planning team has prepared for each service.': 'Parcourez les exemples préparés par votre équipe pour chaque service.',
    'Vendor categories': 'Catégories de prestataires', 'Wedding ideas': 'Idées de mariage', 'Coming soon': 'Bientôt disponible', 'example': 'exemple', 'examples': 'exemples',
    'Your planning team will share wedding ideas here.': 'Votre équipe partagera ici des idées de mariage.', 'Inspiration photo coming soon': 'Photo d’inspiration bientôt disponible', 'Colors': 'Couleurs',
    'YOUR WEDDING PLAN': 'VOTRE PLAN DE MARIAGE', 'Approved plan estimate': 'Estimation du plan approuvé', 'Requested budget': 'Budget demandé', 'Planning allocation': 'Répartition du budget',
    'A few details to get started': 'Quelques détails pour commencer', 'Wedding style': 'Style du mariage', 'Guest count': 'Nombre d’invités', 'Save wedding details': 'Enregistrer les détails du mariage',
    'Availability will appear once your wedding date is set.': 'La disponibilité apparaîtra une fois la date du mariage définie.',
    'Loading your checklist…': 'Chargement de votre liste…', 'Loading inspiration…': 'Chargement des inspirations…', 'View inspiration boards': 'Voir les inspirations', 'All categories': 'Toutes les catégories',
  },
  rw: {
    'Language': 'Ururimi', 'English': 'Icyongereza', 'French': 'Igifaransa', 'Kinyarwanda': 'Ikinyarwanda',
    'Budget': 'Ingengo y’imari', 'Packages': 'Amahitamo ya serivisi', 'Checklist': 'Urutonde rw’imirimo', 'Inspiration': 'Ibitekerezo', 'Contracts': 'Amasezerano', 'Payments': 'Kwishyura', 'Contact': 'Twandikire',
    'Choose or review your paid wedding planning package.': 'Hitamo cyangwa urebe serivisi yo gutegura ubukwe wishyuye.',
    'Save plan': 'Bika gahunda', 'Share plan': 'Sangiza gahunda', 'Sign out': 'Sohoka', 'Wedding account': 'Konti y’ubukwe',
    'Sign in': 'Injira', 'Create an account': 'Fungura konti', 'Create free account': 'Fungura konti ku buntu', 'Edit details': 'Hindura amakuru', 'Edit wedding details': 'Hindura amakuru y’ubukwe',
    'Your wedding plan overview': 'Incamake ya gahunda y’ubukwe bwawe', 'Sign in to view your wedding details.': 'Injira urebe amakuru y’ubukwe bwawe.',
    'Wedding budget': 'Ingengo y’imari y’ubukwe', 'Guests': 'Abatumirwa', 'Location': 'Aho bizabera', 'Wedding date': 'Itariki y’ubukwe', 'people': 'abantu',
    'Your total budget': 'Ingengo y’imari yose', 'Plan estimate': 'Ikigereranyo cya gahunda', 'Awaiting plan': 'Hategerejwe gahunda',
    'Your illustrative budget plan': 'Urugero rw’ingengo y’imari yawe', 'Illustrative budget plan': 'Urugero rw’ingengo y’imari', 'categories': 'ibyiciro',
    'Availability': 'Kuboneka', 'Not checked': 'Ntibiragenzurwa', 'Waiting for vendor': 'Hategerejwe igisubizo cy’utanga serivisi', 'Available': 'Araboneka', 'Unavailable': 'Ntaboneka', 'Approved': 'Byemejwe', 'Loading status…': 'Birimo gutegurwa…',
    'Priced vendors exceed this category budget': 'Ibiciro by’abatanga serivisi birenze ingengo y’iki cyiciro', 'Our team is finding a match': 'Itsinda ryacu ririmo gushaka ubihuje n’ibyo ukeneye',
    'Suggested starting percentages. Your planning team can adjust them to your priorities.': 'Ijanisha ni urugero rw’ibanze. Itsinda ry’imitegurire rishobora kurihindura rikurikije ibyo ushyize imbere.',
    'YOUR WEDDING WORKSPACE': 'AHO UTEGURIRA UBUKWE BWAWE', 'Sign in to see your plan': 'Injira urebe gahunda yawe',
    'Your budget, checklist, inspiration, contracts, and payment records are private to your account.': 'Ingengo y’imari, urutonde, ibitekerezo, amasezerano n’inyandiko z’ubwishyu bigaragara kuri konti yawe gusa.',
    'Budget proposal': 'Umushinga w’ingengo y’imari', 'Under review': 'Birimo gusuzumwa', 'Your planning team will share a detailed budget proposal here.': 'Itsinda ry’imitegurire rizashyira hano umushinga urambuye w’ingengo y’imari.',
    'Contact us': 'Twandikire', 'Send a message to our wedding planning team.': 'Ohereza ubutumwa ku itsinda ryacu ritegura ubukwe.', 'Phone number': 'Nimero ya telefoni',
    'No vendor contracts have been shared with your account yet.': 'Nta masezerano y’utanga serivisi arashyirwa kuri konti yawe.',
    'PAYMENT SCHEDULE': 'GAHUNDA Y’UBWISHYU', 'No vendor payments have been recorded yet.': 'Nta bwishyu bw’utanga serivisi burandikwa.',
    'A LITTLE MORE ORGANIZED, A LOT MORE YOU': 'TEGURA NEZA UBUKWE BUGARAGAZA WOWE', 'Your day starts here.': 'Urugendo rwanyu rutangirira hano.', 'Welcome back.': 'Urahawe ikaze nanone.',
    'Create your account and keep every wedding detail close.': 'Fungura konti ubike amakuru yose y’ubukwe bwawe hamwe.', 'Sign in to pick up where you left off.': 'Injira ukomereze aho wari ugeze.',
    'Your name': 'Amazina yawe', 'Email address': 'Imeyili', 'Password': 'Ijambo ry’ibanga', 'At least 10 characters': 'Nibura inyuguti 10', 'Your password': 'Ijambo ry’ibanga ryawe',
    'Use at least 10 characters to keep your account secure.': 'Koresha nibura inyuguti 10 kugira ngo urinde konti yawe.', 'Already have an account?': 'Usanzwe ufite konti?', 'New to The EventNest?': 'Ni ubwa mbere ukoresha The EventNest?', 'Event account': 'Konti y’ibirori',
    'Hide password': 'Hisha ijambo ry’ibanga', 'Show password': 'Erekana ijambo ry’ibanga', 'Your details are kept private and secure.': 'Amakuru yawe ararinzwe kandi ni ibanga.',
    'Create my account': 'Fungura konti yanjye', 'One moment…': 'Tegereza gato…', 'Back to your plan': 'Subira kuri gahunda yawe',
    'Your guest count': 'Umubare w’abatumirwa', 'Your chosen location': 'Aho wahisemo', 'Your chosen date': 'Itariki wahisemo',
    'Fits category allowance': 'Biri mu ngengo y’iki cyiciro', 'No budget categories match the selected services yet.': 'Nta byiciro by’ingengo y’imari bihuye na serivisi wahisemo kugeza ubu.',
    'No specific services selected': 'Nta serivisi runaka wahisemo', 'A copy of your wedding plan was downloaded.': 'Hakuwe kopi ya gahunda y’ubukwe bwawe.', 'Plan summary and app link copied.': 'Incamake ya gahunda n’umuyoboro wa porogaramu byandukuwe.',
    'Not set yet': 'Ntibirashyirwaho', 'Not set': 'Ntibizwi', 'Your budget': 'Ingengo y’imari yawe',
    'Venue': 'Ahazabera ubukwe', 'Catering': 'Ibiribwa n’ibinyobwa', 'Decoration': 'Imitako', 'Other Costs': 'Ibindi bisohoka', 'Photography & Video': 'Amafoto na videwo', 'Florist & Flowers': 'Indabo', 'Attire': 'Imyambaro', 'Transport': 'Ubwikorezi', 'Cake': 'Umutsima w’ubukwe',
    'Overview': 'Incamake', 'Budgets': 'Ingengo z’imari', 'Vendors': 'Abatanga serivisi', 'Wedding plans': 'Gahunda z’ubukwe', 'Checklists': 'Urutonde rw’imirimo', 'Notifications': 'Ubutumwa', 'Budget review': 'Isuzuma ry’ingengo y’imari', 'Vendor management': 'Imicungire y’abatanga serivisi', 'Guest management': 'Imicungire y’abatumirwa', 'Inspiration library': 'Ibitabo by’ibitekerezo', 'Good morning': 'Mwaramutse', 'Secure administrator access': 'Uburenganzira bw’umuyobozi burinzwe',
    'YOUR AGREEMENTS': 'AMASEZERANO YAWE', 'Thoughtfully made for your day': 'Byateguwe neza ku munsi wawe',
    'Hello': 'Muraho', 'A thoughtful beginning to your forever': 'Intangiriro nziza y’urukundo rwanyu',
    'Tell us about your day': 'Tuganirire ku munsi wawe', 'Share the essentials. Your planning team will use them to understand what matters to you and prepare a thoughtful plan.': 'Tanga amakuru y’ingenzi kugira ngo itsinda ry’imitegurire rimenye ibyo uha agaciro ritegure gahunda ikubereye.',
    'Your total budget for the celebration.': 'Ingengo y’imari yose y’umunsi mukuru.', 'An estimate is perfectly fine.': 'Ushobora gutanga ikigereranyo.', 'Still deciding? You can add it later.': 'Niba utarabyemeza, uzabyongeraho nyuma.', 'City, district, or preferred area.': 'Umujyi, akarere cyangwa ahantu wahisemo.',
    'Optional': 'Si ngombwa', 'We are still exploring': 'Turacyashakisha uko byagenda', 'Classic and elegant': 'Bisanzwe kandi byiza', 'Garden romance': 'Ubukwe mu busitani', 'Modern and minimal': 'Bugezweho kandi bworoheje', 'Cultural celebration': 'Umunsi mukuru w’umuco', 'Destination wedding': 'Ubukwe bw’ahandi', 'Other': 'Ibindi',
    'What will your celebration include?': 'Umunsi mukuru wawe uzaba urimo iki?', 'Select the ceremony and celebration format that fits your plans.': 'Hitamo uko umuhango n’umunsi mukuru bizagenda.',
    'Traditional + church + reception': 'Gakondo + kiliziya + ibirori', 'Traditional ceremony followed by church ceremony and reception': 'Umuhango wa gakondo ukurikirwa n’uwa kiliziya n’ibirori', 'Church + reception': 'Kiliziya n’ibirori', 'Church ceremony followed by a reception': 'Umuhango wa kiliziya ukurikirwa n’ibirori', 'Traditional celebration': 'Umunsi mukuru wa gakondo', 'Traditional ceremony and celebration': 'Umuhango n’ibirori bya gakondo', 'Other or still deciding': 'Ibindi cyangwa nturabyemeza', 'We can update these details later': 'Ibi bisobanuro ushobora kubihindura nyuma',
    'What matters most to you?': 'Ni ikihe kintu k’ingenzi kuri wowe?', 'Share any traditions, accessibility needs, priorities, or ideas you already have in mind.': 'Tanga amakuru ku muco, ibyo ukeneye, ibyo uha agaciro cyangwa ibitekerezo ufite.', 'This helps the planning team understand your priorities.': 'Ibi bifasha itsinda kumenya ibyo uha agaciro.', 'Which vendors or services may you need?': 'Ni abahe batanga serivisi ushobora gukenera?', 'Choose any that apply, or leave all unselected. Your planning team is already part of this service.': 'Hitamo ibyo ukeneye cyangwa ubireke byose. Itsinda ry’imitegurire riri muri iyi serivisi.',
    'Your details are private and only shared with your planning team.': 'Amakuru yawe ni ibanga kandi asangizwa itsinda ry’imitegurire gusa.', 'Saving your details…': 'Amakuru yawe arimo kubikwa…', 'You can update your details at any time.': 'Ushobora guhindura amakuru yawe igihe icyo ari cyo cyose.',
    'YOUR WEDDING TASKS': 'IMIRIMO Y’UBUKWE BWAWE', 'See your requested vendor services and the progress your planning team has marked.': 'Reba serivisi wasabye n’aho imyiteguro igeze.',
    'complete': 'byarangiye', 'Completed by your planning team': 'Byarangiye kubera itsinda ry’imitegurire', 'To do': 'Ibisigaye gukorwa', 'Vendor not selected yet': 'Nta utanga serivisi uratoranywa',
    'Your selected vendor services will appear here.': 'Serivisi wahisemo zizagaragara hano.', 'IDEAS FOR YOUR CELEBRATION': 'IBITEKEREZO BY’UMUNSI MUKURU', 'Browse the examples your planning team has prepared for each service.': 'Reba ingero itsinda ry’imitegurire ryateguye kuri buri serivisi.',
    'Vendor categories': 'Ibyiciro by’abatanga serivisi', 'Wedding ideas': 'Ibitekerezo by’ubukwe', 'Coming soon': 'Bizaza vuba', 'example': 'urugero', 'examples': 'ingero',
    'Your planning team will share wedding ideas here.': 'Itsinda ry’imitegurire rizashyira hano ibitekerezo by’ubukwe.', 'Inspiration photo coming soon': 'Ifoto y’igitekerezo izaza vuba', 'Colors': 'Amabara',
    'YOUR WEDDING PLAN': 'GAHUNDA Y’UBUKWE BWAWE', 'Approved plan estimate': 'Ikigereranyo cya gahunda yemejwe', 'Requested budget': 'Ingengo y’imari wasabye', 'Planning allocation': 'Ingengo yagenewe igikorwa',
    'A few details to get started': 'Amakuru make yo gutangira', 'Wedding style': 'Uko ubukwe uzabukora', 'Guest count': 'Umubare w’abatumirwa', 'Save wedding details': 'Bika amakuru y’ubukwe',
    'See your budget, selected services, and planning proposal.': 'Reba ingengo y’imari, serivisi wahisemo na gahunda yateguwe.',
    'See your requested vendors and the progress your planning team has marked.': 'Reba abatanga serivisi wasabye n’aho imyiteguro igeze.',
    'Explore ideas and wedding inspiration shared with you.': 'Reba ibitekerezo by’ubukwe wasangijwe.',
    'Review vendor contracts shared with your account.': 'Reba amasezerano y’abatanga serivisi wasangijwe.',
    'Track payments recorded against your vendor contracts.': 'Kurikirana ubwishyu bw’amasezerano y’abatanga serivisi.',
    'Availability will appear once your wedding date is set.': 'Amakuru yo kuboneka azagaragara umaze gushyiraho itariki y’ubukwe.',
    'Loading your checklist…': 'Urutonde rwawe rurimo gufunguka…', 'Loading inspiration…': 'Ibitekerezo birimo gufunguka…', 'View inspiration boards': 'Reba ibitekerezo', 'All categories': 'Ibyiciro byose',
  },
};

type LanguageContextValue = { language: Language; setLanguage: (language: Language) => void; t: (value: string) => string };
const LanguageContext = createContext<LanguageContextValue | null>(null);
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('my-wedding-plan-language');
    return saved === 'fr' || saved === 'rw' ? saved : 'en';
  });
  const setLanguage = (next: Language) => { setLanguageState(next); localStorage.setItem('my-wedding-plan-language', next); document.documentElement.lang = next === 'rw' ? 'rw' : next; };
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: (text: string) => translations[language][text] ?? text }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
export function LanguagePicker() {
  const { language, setLanguage, t } = useLanguage();
  return <label className="language-picker"><span>{t('Language')}</span><select aria-label={t('Language')} value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">{t('English')}</option><option value="fr">{t('French')}</option><option value="rw">{t('Kinyarwanda')}</option></select></label>;
}
