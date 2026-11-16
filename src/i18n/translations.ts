import { AppletId, SupportedLanguage } from '../nand/types';

export interface LanguageMeta {
  code: SupportedLanguage;
  label: string;
  flag: string;
  regionHint: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  { code: 'en', label: 'English', flag: '🇺🇸', regionHint: 'US / UK' },
  { code: 'es', label: 'Español', flag: '🇪🇸', regionHint: 'ES / MX' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', regionHint: 'FR / CA' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', regionHint: 'DE / AT' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹', regionHint: 'IT / CH' },
  { code: 'ja', label: '日本語', flag: '🇯🇵', regionHint: 'JP' },
  { code: 'pt', label: 'Português', flag: '🇵🇹', regionHint: 'PT / BR' },
];

export interface TitleI18n {
  shortName: string;
  fullName: string;
  description: string;
}

export interface SystemTranslations {
  // General & Bottom Bar
  open: string;
  manual: string;
  folder: string;
  close: string;
  save: string;
  back: string;
  cancel: string;
  returnHome: string;
  emptySlot: string;
  noCartridge: string;
  newFolder: string;
  arrange: string;
  swapTiles: string;
  coins: string;
  steps: string;

  // Status Bar
  enabled: string;
  disabled: string;
  suspended: string;
  soundButton: string;
  soundNotice: string;

  // HOME Menu Settings Modal (Wrench icon)
  homeSettings: string;
  theme: string;
  changeTheme: string;
  brightness: string;
  iconLayout: string;
  singleRow: string;
  doubleRow: string;
  tripleRow: string;
  createFolder: string;

  // System Settings Applet
  settingsTitle: string;
  ownerProfile: string;
  language: string;
  region: string;
  wifi: string;
  audio: string;
  formatNand: string;
  synced: string;
  writingIdb: string;
  nandConfigState: string;
  persistedInfo: string;
  serialNumber: string;
  firmware: string;

  // Health & Safety
  healthTitle: string;
  healthWarning: string;
  health3DPrecaution: string;
  healthFatigueWarning: string;
  healthNandInfo: string;

  // Activity Log
  activityDailyLog: string;
  activityTodaySteps: string;
  activityPlayCoins: string;
  activityWalkPedometer: string;
  activitySoftwareLibrary: string;
  activityLaunchCount: string;
  activityPlayTime: string;
  activityLastPlayed: string;

  // Game Notes
  notesTitle: string;
  notesPen: string;
  notesEraser: string;
  notesClear: string;
  notesSaveMemo: string;
  notesSavedMemos: string;
  notesNoNotes: string;

  // Sound Studio
  soundTitle: string;
  soundSynthStudio: string;
  soundPlay: string;
  soundStop: string;
  soundTempo: string;
  soundWaveform: string;

  // Cartridge Game
  cartScore: string;
  cartHighScore: string;
  cartShield: string;
  cartShoot: string;
  cartGameOver: string;
  cartPressRestart: string;

  // Mii Maker
  miiTitle: string;
  miiCreateNew: string;
  miiName: string;
  miiGreeting: string;
  miiHairStyle: string;
  miiShirtColor: string;
  miiSaveMii: string;
}

const TITLES_MAP: Record<SupportedLanguage, Record<AppletId, TitleI18n>> = {
  en: {
    'health-safety': {
      shortName: 'Health & Safety',
      fullName: 'Health and Safety Information',
      description: 'Important hardware safety, 3D viewing guidelines, and virtual NAND documentation.',
    },
    cartridge: {
      shortName: 'Game Card',
      fullName: 'Starburst Pilot 3D (Game Card)',
      description: 'Playable dual-screen arcade shooter stored on the simulated Game Card slot.',
    },
    'system-settings': {
      shortName: 'System Settings',
      fullName: 'System Settings',
      description: 'Configure Owner Profile, Language, Theme, LCD Brightness, Audio, and NAND Format.',
    },
    'mii-maker': {
      shortName: 'Mii Maker',
      fullName: 'Mii Maker & Plaza',
      description: 'Create and customize Mii characters persisted directly into NAND_USERDATA.',
    },
    'activity-log': {
      shortName: 'Activity Log',
      fullName: 'Activity Log',
      description: 'Inspect real software playtime records and earn Play Coins via the step pedometer.',
    },
    'sound-studio': {
      shortName: '3DS Sound',
      fullName: 'Nintendo 3DS Sound',
      description: 'Dual-screen music player, audio visualizer, voice recorder, and 8-step synthesizer.',
    },
    'game-notes': {
      shortName: 'Game Notes',
      fullName: 'Game Notes',
      description: 'Stylus sketch pad for writing game memos, mapping dungeons, and saving sketches.',
    },
    browser: {
      shortName: 'Internet Browser',
      fullName: 'Internet Browser',
      description: 'Simulated dual-screen web browser with navigation toolbar and page inspector.',
    },
    'camera-ar': {
      shortName: 'Nintendo 3DS Camera',
      fullName: 'Nintendo 3DS Camera & AR',
      description: 'Stereoscopic camera simulation with depth split slider and AR target overlays.',
    },
  },

  es: {
    'health-safety': {
      shortName: 'Salud y seg.',
      fullName: 'Información sobre salud y seguridad',
      description: 'Pautas de seguridad importantes, uso del 3D y cuidado del sistema.',
    },
    cartridge: {
      shortName: 'Tarjeta',
      fullName: 'Starburst Pilot 3D (Tarjeta)',
      description: 'Juego arcade espacial de doble pantalla cargado en la ranura para tarjetas.',
    },
    'system-settings': {
      shortName: 'Configuración',
      fullName: 'Configuración de la consola',
      description: 'Configura el perfil de usuario, idioma, tema, brillo y memoria NAND.',
    },
    'mii-maker': {
      shortName: 'Editor de Mii',
      fullName: 'Editor de Mii y Plaza',
      description: 'Crea y personaliza personajes Mii guardados directamente en la memoria.',
    },
    'activity-log': {
      shortName: 'Registro',
      fullName: 'Registro de actividad',
      description: 'Consulta el tiempo de juego y acumula monedas de juego con el podómetro.',
    },
    'sound-studio': {
      shortName: 'Nintendo 3DS Sound',
      fullName: 'Nintendo 3DS Sound',
      description: 'Reproductor de música, visualizador de audio y sintetizador de 8 pasos.',
    },
    'game-notes': {
      shortName: 'Notas',
      fullName: 'Notas de juego',
      description: 'Bloc de notas táctil para dibujar planos y tomar apuntes durante tus partidas.',
    },
    browser: {
      shortName: 'Navegador',
      fullName: 'Navegador de internet',
      description: 'Navega por la red con visualización adaptada a doble pantalla.',
    },
    'camera-ar': {
      shortName: 'Cámara 3DS',
      fullName: 'Cámara de Nintendo 3DS',
      description: 'Simulador de cámara estereoscópica con efecto 3D y visor RA.',
    },
  },

  fr: {
    'health-safety': {
      shortName: 'Santé et sécurité',
      fullName: 'Informations sur la santé et la sécurité',
      description: 'Consignes de sécurité, précautions d’affichage 3D et entretien du système.',
    },
    cartridge: {
      shortName: 'Carte de jeu',
      fullName: 'Starburst Pilot 3D (Carte de jeu)',
      description: 'Jeu de tir spatial d’arcade sur deux écrans inséré dans le port cartouche.',
    },
    'system-settings': {
      shortName: 'Paramètres',
      fullName: 'Paramètres de la console',
      description: 'Configurez le profil, la langue, le thème, la luminosité et la mémoire NAND.',
    },
    'mii-maker': {
      shortName: 'Éditeur Mii',
      fullName: 'Éditeur Mii et Place',
      description: 'Créez et personnalisez des personnages Mii enregistrés dans la mémoire interne.',
    },
    'activity-log': {
      shortName: 'Journal',
      fullName: 'Journal d’activité',
      description: 'Consultez votre historique de jeu et gagnez des pièces grâce au podomètre.',
    },
    'sound-studio': {
      shortName: 'Nintendo 3DS Sound',
      fullName: 'Nintendo 3DS Sound',
      description: 'Lecteur audio, visualiseur et synthétiseur 8 pas pour explorer vos sons.',
    },
    'game-notes': {
      shortName: 'Notes de jeu',
      fullName: 'Notes de jeu',
      description: 'Carnet de dessin au stylet pour croquer des cartes et noter vos stratégies.',
    },
    browser: {
      shortName: 'Navigateur',
      fullName: 'Navigateur Internet',
      description: 'Naviguez sur le Web avec une interface double écran fidèle à Horizon OS.',
    },
    'camera-ar': {
      shortName: 'Appareil photo',
      fullName: 'Appareil photo Nintendo 3DS',
      description: 'Expérience photographique stéréoscopique 3D avec superposition de cibles RA.',
    },
  },

  de: {
    'health-safety': {
      shortName: 'Gesundheit',
      fullName: 'Gesundheits- und Sicherheitsinformationen',
      description: 'Wichtige Sicherheitshinweise, 3D-Blickrichtlinien und Konsolenpflege.',
    },
    cartridge: {
      shortName: 'Softwarekarte',
      fullName: 'Starburst Pilot 3D (Softwarekarte)',
      description: 'Spielbarer Doppelbildschirm-Shooter im Steckplatz für Softwarekarten.',
    },
    'system-settings': {
      shortName: 'Systemeinstellungen',
      fullName: 'Systemeinstellungen',
      description: 'Nutzerprofil, Sprache, HOME-Design, Helligkeit, Audio und NAND verwalten.',
    },
    'mii-maker': {
      shortName: 'Mii-Kanal',
      fullName: 'Mii-Kanal & Plaza',
      description: 'Erschaffe und gestalte individuelle Mii-Charaktere in NAND_USERDATA.',
    },
    'activity-log': {
      shortName: 'Aktivitätslog',
      fullName: 'Aktivitätslog',
      description: 'Überprüfe Software-Spielzeiten und sammle Spielmünzen mit dem Schrittzähler.',
    },
    'sound-studio': {
      shortName: 'Nintendo 3DS Sound',
      fullName: 'Nintendo 3DS Sound',
      description: 'Audio-Player, Frequenz-Visualisierer und integrierter 8-Schritt-Synthesizer.',
    },
    'game-notes': {
      shortName: 'Spielnotizen',
      fullName: 'Spielnotizen',
      description: 'Praktischer Skizzenblock für handgezeichnete Memos und Spieltipps.',
    },
    browser: {
      shortName: 'Internet-Browser',
      fullName: 'Internet-Browser',
      description: 'Doppelbildschirm-Webbrowser mit Menüleiste und Dokumentanzeige.',
    },
    'camera-ar': {
      shortName: '3DS Kamera',
      fullName: 'Nintendo 3DS Kamera',
      description: 'Stereoskopische 3D-Kamera mit Tiefenregler und AR-Karten-Zielmarkierung.',
    },
  },

  it: {
    'health-safety': {
      shortName: 'Salute e sicurezza',
      fullName: 'Informazioni per la salute e la sicurezza',
      description: 'Avvertenze per la salute, visione 3D e istruzioni per l’uso della console.',
    },
    cartridge: {
      shortName: 'Scheda gioco',
      fullName: 'Starburst Pilot 3D (Scheda gioco)',
      description: 'Sparatutto spaziale a doppio schermo inserito nello slot schede di gioco.',
    },
    'system-settings': {
      shortName: 'Impostazioni',
      fullName: 'Impostazioni della console',
      description: 'Profilo utente, lingua, tema, luminosità schermo, audio e formato NAND.',
    },
    'mii-maker': {
      shortName: 'Centro di creazione Mii',
      fullName: 'Centro di creazione Mii',
      description: 'Crea e personalizza i tuoi personaggi Mii salvati nella memoria NAND.',
    },
    'activity-log': {
      shortName: 'Registro attività',
      fullName: 'Registro attività',
      description: 'Monitora il tempo trascorso nei giochi e ottieni monete di gioco camminando.',
    },
    'sound-studio': {
      shortName: 'Nintendo 3DS Sound',
      fullName: 'Nintendo 3DS Sound',
      description: 'Lettore musicale, visualizzatore grafico e sintetizzatore audio a 8 passi.',
    },
    'game-notes': {
      shortName: 'Note di gioco',
      fullName: 'Note di gioco',
      description: 'Blocco note con pennino per tracciare mappe e appunti durante le sessioni.',
    },
    browser: {
      shortName: 'Browser',
      fullName: 'Browser Internet',
      description: 'Naviga sul Web con un’interfaccia ottimizzata per i due schermi 3DS.',
    },
    'camera-ar': {
      shortName: 'Fotocamera 3DS',
      fullName: 'Fotocamera Nintendo 3DS',
      description: 'Simulazione di fotocamera 3D stereoscopica con regolatore di parallasse.',
    },
  },

  ja: {
    'health-safety': {
      shortName: '安全に使用するために',
      fullName: '安全に使用するために',
      description: '健康と安全に関する重要なお知らせ、3D映像の視聴ガイドラインおよびお手入れ方法。',
    },
    cartridge: {
      shortName: 'ゲームカード',
      fullName: 'スターバーストパイロット3D (ゲームカード)',
      description: 'ゲームカードスロットに挿入された2画面対応アーケード宇宙シューティング。',
    },
    'system-settings': {
      shortName: '本体設定',
      fullName: '本体設定',
      description: 'ユーザー情報、言語、テーマ、画面の明るさ、音声設定および本体の初期化。',
    },
    'mii-maker': {
      shortName: 'Miiスタジオ',
      fullName: 'Miiスタジオ',
      description: '自分や友だちのMiiを作成・カスタマイズし、NANDストレージに保存します。',
    },
    'activity-log': {
      shortName: '思い出きろく帳',
      fullName: '思い出きろく帳',
      description: '遊んだソフトの記録確認や、歩数計連動のゲームコイン獲得ができます。',
    },
    'sound-studio': {
      shortName: '3DSサウンド',
      fullName: 'ニンテンドー3DSサウンド',
      description: '音楽再生、ビジュアライザー、音声録音、8ステップシンセサイザー。',
    },
    'game-notes': {
      shortName: 'ゲームメモ',
      fullName: 'ゲームメモ',
      description: 'タッチペンを使って手書きのメモや攻略マップを描き残せます。',
    },
    browser: {
      shortName: 'ブラウザー',
      fullName: 'インターネットブラウザー',
      description: '上下画面を活用したデュアルスクリーン表示対応のウェブブラウザー。',
    },
    'camera-ar': {
      shortName: '3DSカメラ',
      fullName: 'ニンテンドー3DSカメラ',
      description: '立体視3DカメラシミュレーションとARターゲットカード表示。',
    },
  },

  pt: {
    'health-safety': {
      shortName: 'Informações de Saúde',
      fullName: 'Informações de Saúde e Segurança',
      description: 'Diretrizes de segurança importantes, visualização em 3D e cuidados com a consola.',
    },
    cartridge: {
      shortName: 'Cartão de jogo',
      fullName: 'Starburst Pilot 3D (Cartão de jogo)',
      description: 'Jogo de tiro espacial em ecrã duplo inserido na ranhura de cartões de jogo.',
    },
    'system-settings': {
      shortName: 'Definições',
      fullName: 'Definições da Consola',
      description: 'Configurar perfil, idioma, tema, brilho do ecrã, áudio e formato da NAND.',
    },
    'mii-maker': {
      shortName: 'Criador Mii',
      fullName: 'Criador Mii & Praça',
      description: 'Crie e personalize personagens Mii guardados diretamente na memória NAND.',
    },
    'activity-log': {
      shortName: 'Registo',
      fullName: 'Registo de Atividade',
      description: 'Consulte o tempo jogado e ganhe Moedas de Jogo através do pedómetro de passos.',
    },
    'sound-studio': {
      shortName: 'Nintendo 3DS Sound',
      fullName: 'Nintendo 3DS Sound',
      description: 'Reprodutor de música, visualizador e sintetizador sonoro de 8 passos.',
    },
    'game-notes': {
      shortName: 'Notas de Jogo',
      fullName: 'Notas de Jogo',
      description: 'Bloco de notas com caneta para desenhar mapas e registar estratégias.',
    },
    browser: {
      shortName: 'Navegador',
      fullName: 'Navegador de Internet',
      description: 'Navegue na Internet com renderização adaptada aos dois ecrãs.',
    },
    'camera-ar': {
      shortName: 'Câmara 3DS',
      fullName: 'Câmara Nintendo 3DS',
      description: 'Simulador fotográfico 3D estereoscópico com sobreposição de alvos RA.',
    },
  },
};

const TRANSLATIONS: Record<SupportedLanguage, SystemTranslations> = {
  en: {
    open: 'Open',
    manual: 'Manual',
    folder: 'Folder',
    close: 'Close',
    save: 'Save',
    back: 'Back',
    cancel: 'Cancel',
    returnHome: 'Return to HOME',
    emptySlot: 'Empty',
    noCartridge: 'No Game Card is inserted.',
    newFolder: 'New Folder',
    arrange: 'Arrange',
    swapTiles: 'Tap another slot to place',
    coins: 'Play Coins',
    steps: 'Steps',

    enabled: 'Enabled',
    disabled: 'Disabled',
    suspended: 'Suspended',
    soundButton: 'Sound',
    soundNotice: 'Click to enable audio',

    homeSettings: 'HOME Menu Settings',
    theme: 'Theme',
    changeTheme: 'Change Theme',
    brightness: 'Screen Brightness',
    iconLayout: 'Icon Layout',
    singleRow: 'Single Row (1x)',
    doubleRow: 'Double Row (2x)',
    tripleRow: 'Triple Row (3x)',
    createFolder: 'Create Folder',

    settingsTitle: 'System Settings',
    ownerProfile: 'Owner Profile',
    language: 'Language',
    region: 'Region',
    wifi: 'Wi-Fi',
    audio: 'Audio',
    formatNand: 'Format NAND',
    synced: 'Synced',
    writingIdb: 'Writing IDB...',
    nandConfigState: 'NAND Config State',
    persistedInfo: 'Persisted in TWL_SYSDATA (chunks 48..79)',
    serialNumber: 'Serial Number',
    firmware: 'Firmware Version',

    healthTitle: 'Health & Safety Information',
    healthWarning: 'Important Health and Safety Precautions',
    health3DPrecaution: 'Take a 10 to 15 minute break every hour of 3D gaming.',
    healthFatigueWarning: 'Discontinue use immediately if you experience eye fatigue, dizziness, or strain.',
    healthNandInfo: 'This virtual 3DS system simulates authentic hardware cryptographic partitions.',

    activityDailyLog: 'Daily Steps & Play Time',
    activityTodaySteps: "Today's Steps",
    activityPlayCoins: 'Play Coins',
    activityWalkPedometer: 'Walk 100 steps (+1 Coin)',
    activitySoftwareLibrary: 'Software Library',
    activityLaunchCount: 'Times Played',
    activityPlayTime: 'Play Time',
    activityLastPlayed: 'Last Played',

    notesTitle: 'Game Notes',
    notesPen: 'Pen',
    notesEraser: 'Eraser',
    notesClear: 'Clear Page',
    notesSaveMemo: 'Save Memo',
    notesSavedMemos: 'Saved Memos',
    notesNoNotes: 'No notes saved yet. Sketch above to create a memo!',

    soundTitle: 'Nintendo 3DS Sound',
    soundSynthStudio: '8-Step Audio Synthesizer',
    soundPlay: 'Play',
    soundStop: 'Stop',
    soundTempo: 'Tempo',
    soundWaveform: 'Waveform',

    cartScore: 'Score',
    cartHighScore: 'High Score',
    cartShield: 'Shield',
    cartShoot: 'Shoot [A]',
    cartGameOver: 'GAME OVER',
    cartPressRestart: 'Press [A] to Restart',

    miiTitle: 'Mii Maker',
    miiCreateNew: 'Create New Mii',
    miiName: 'Mii Name',
    miiGreeting: 'Greeting',
    miiHairStyle: 'Hair Style',
    miiShirtColor: 'Shirt Color',
    miiSaveMii: 'Save Mii',
  },

  es: {
    open: 'Abrir',
    manual: 'Manual',
    folder: 'Carpeta',
    close: 'Cerrar',
    save: 'Guardar',
    back: 'Atrás',
    cancel: 'Cancelar',
    returnHome: 'Volver al Menú HOME',
    emptySlot: 'Vacío',
    noCartridge: 'No hay tarjeta de juego insertada.',
    newFolder: 'Nueva carpeta',
    arrange: 'Mover',
    swapTiles: 'Toca otra casilla para colocar',
    coins: 'Monedas',
    steps: 'Pasos',

    enabled: 'Activado',
    disabled: 'Desactivado',
    suspended: 'En pausa',
    soundButton: 'Sonido',
    soundNotice: 'Pulsa para activar el sonido',

    homeSettings: 'Ajustes del Menú HOME',
    theme: 'Tema',
    changeTheme: 'Cambiar tema',
    brightness: 'Brillo de pantalla',
    iconLayout: 'Diseño de iconos',
    singleRow: 'Fila única (1x)',
    doubleRow: 'Doble fila (2x)',
    tripleRow: 'Triple fila (3x)',
    createFolder: 'Crear carpeta',

    settingsTitle: 'Configuración de la consola',
    ownerProfile: 'Perfil de usuario',
    language: 'Idioma',
    region: 'Región',
    wifi: 'Wi-Fi',
    audio: 'Sonido',
    formatNand: 'Formatear NAND',
    synced: 'Sincronizado',
    writingIdb: 'Guardando en IDB...',
    nandConfigState: 'Estado de config. NAND',
    persistedInfo: 'Guardado en TWL_SYSDATA (bloques 48..79)',
    serialNumber: 'Número de serie',
    firmware: 'Versión del sistema',

    healthTitle: 'Salud y seguridad',
    healthWarning: 'Precauciones importantes de salud y seguridad',
    health3DPrecaution: 'Descansa de 10 a 15 minutos por cada hora de juego en 3D.',
    healthFatigueWarning: 'Detén el juego de inmediato si sientes mareos o fatiga visual.',
    healthNandInfo: 'Esta consola virtual simula particiones con cifrado criptográfico real.',

    activityDailyLog: 'Pasos diarios y tiempo jugado',
    activityTodaySteps: 'Pasos de hoy',
    activityPlayCoins: 'Monedas de juego',
    activityWalkPedometer: 'Caminar 100 pasos (+1 moneda)',
    activitySoftwareLibrary: 'Librería de programas',
    activityLaunchCount: 'Veces jugado',
    activityPlayTime: 'Tiempo jugado',
    activityLastPlayed: 'Última partida',

    notesTitle: 'Notas de juego',
    notesPen: 'Lápiz',
    notesEraser: 'Goma',
    notesClear: 'Borrar todo',
    notesSaveMemo: 'Guardar nota',
    notesSavedMemos: 'Notas guardadas',
    notesNoNotes: 'No hay notas aún. ¡Dibuja arriba para crear una!',

    soundTitle: 'Nintendo 3DS Sound',
    soundSynthStudio: 'Sintetizador de 8 pasos',
    soundPlay: 'Reproducir',
    soundStop: 'Detener',
    soundTempo: 'Tempo',
    soundWaveform: 'Forma de onda',

    cartScore: 'Puntos',
    cartHighScore: 'Récord',
    cartShield: 'Escudo',
    cartShoot: 'Disparar [A]',
    cartGameOver: 'FIN DE LA PARTIDA',
    cartPressRestart: 'Pulsa [A] para reiniciar',

    miiTitle: 'Editor de Mii',
    miiCreateNew: 'Crear nuevo Mii',
    miiName: 'Nombre del Mii',
    miiGreeting: 'Saludo',
    miiHairStyle: 'Peinado',
    miiShirtColor: 'Color de camiseta',
    miiSaveMii: 'Guardar Mii',
  },

  fr: {
    open: 'Ouvrir',
    manual: 'Notice',
    folder: 'Dossier',
    close: 'Fermer',
    save: 'Sauvegarder',
    back: 'Retour',
    cancel: 'Annuler',
    returnHome: 'Retour au Menu HOME',
    emptySlot: 'Vide',
    noCartridge: "Aucune carte de jeu n'est insérée.",
    newFolder: 'Nouveau dossier',
    arrange: 'Organiser',
    swapTiles: 'Touchez un autre emplacement',
    coins: 'Pièces',
    steps: 'Pas',

    enabled: 'Activé',
    disabled: 'Désactivé',
    suspended: 'Suspendu',
    soundButton: 'Son',
    soundNotice: 'Cliquez pour activer le son',

    homeSettings: 'Paramètres du Menu HOME',
    theme: 'Thème',
    changeTheme: 'Changer de thème',
    brightness: 'Luminosité',
    iconLayout: 'Disposition des icônes',
    singleRow: 'Ligne simple (1x)',
    doubleRow: 'Deux lignes (2x)',
    tripleRow: 'Trois lignes (3x)',
    createFolder: 'Créer un dossier',

    settingsTitle: 'Paramètres de la console',
    ownerProfile: "Profil de l'utilisateur",
    language: 'Langue',
    region: 'Région',
    wifi: 'Wi-Fi',
    audio: 'Audio',
    formatNand: 'Formater la NAND',
    synced: 'Synchronisé',
    writingIdb: 'Écriture IDB...',
    nandConfigState: 'État config NAND',
    persistedInfo: 'Stocké dans TWL_SYSDATA (blocs 48..79)',
    serialNumber: 'Numéro de série',
    firmware: 'Version du logiciel',

    healthTitle: 'Santé et sécurité',
    healthWarning: 'Précautions importantes pour la santé et la sécurité',
    health3DPrecaution: 'Faites une pause de 10 à 15 minutes toutes les heures de jeu en 3D.',
    healthFatigueWarning: "Arrêtez immédiatement de jouer si vous ressentez de la fatigue oculaire.",
    healthNandInfo: 'Ce système virtuel émule des partitions matérielles chiffrées authentiques.',

    activityDailyLog: 'Pas du jour et temps de jeu',
    activityTodaySteps: 'Pas du jour',
    activityPlayCoins: 'Pièces de jeu',
    activityWalkPedometer: 'Marcher 100 pas (+1 pièce)',
    activitySoftwareLibrary: 'Bibliothèque de logiciels',
    activityLaunchCount: 'Parties jouées',
    activityPlayTime: 'Temps de jeu',
    activityLastPlayed: 'Dernière partie',

    notesTitle: 'Notes de jeu',
    notesPen: 'Crayon',
    notesEraser: 'Gomme',
    notesClear: 'Effacer tout',
    notesSaveMemo: 'Sauvegarder',
    notesSavedMemos: 'Notes enregistrées',
    notesNoNotes: 'Aucune note enregistrée. Dessinez pour en créer une !',

    soundTitle: 'Nintendo 3DS Sound',
    soundSynthStudio: 'Synthétiseur 8 étapes',
    soundPlay: 'Lecture',
    soundStop: 'Arrêter',
    soundTempo: 'Tempo',
    soundWaveform: "Forme d'onde",

    cartScore: 'Score',
    cartHighScore: 'Meilleur score',
    cartShield: 'Bouclier',
    cartShoot: 'Tirer [A]',
    cartGameOver: 'PARTIE TERMINÉE',
    cartPressRestart: 'Appuyez sur [A] pour recommencer',

    miiTitle: 'Éditeur Mii',
    miiCreateNew: 'Créer un nouveau Mii',
    miiName: 'Nom du Mii',
    miiGreeting: "Message d'accueil",
    miiHairStyle: 'Coiffure',
    miiShirtColor: 'Couleur du t-shirt',
    miiSaveMii: 'Sauvegarder Mii',
  },

  de: {
    open: 'Öffnen',
    manual: 'Anleitung',
    folder: 'Ordner',
    close: 'Schließen',
    save: 'Speichern',
    back: 'Zurück',
    cancel: 'Abbrechen',
    returnHome: 'Zurück zum HOME-Menü',
    emptySlot: 'Leer',
    noCartridge: 'Keine Softwarekarte eingesteckt.',
    newFolder: 'Neuer Ordner',
    arrange: 'Bewegen',
    swapTiles: 'Tippe auf ein anderes Feld zum Ablegen',
    coins: 'Spielmünzen',
    steps: 'Schritte',

    enabled: 'Aktiviert',
    disabled: 'Deaktiviert',
    suspended: 'Unterbrochen',
    soundButton: 'Ton',
    soundNotice: 'Klicken zum Aktivieren des Tons',

    homeSettings: 'HOME-Menü-Einstellungen',
    theme: 'Design',
    changeTheme: 'Design ändern',
    brightness: 'Helligkeit',
    iconLayout: 'Symbol-Layout',
    singleRow: 'Einzeilig (1x)',
    doubleRow: 'Zweizeilig (2x)',
    tripleRow: 'Dreizeilig (3x)',
    createFolder: 'Ordner erstellen',

    settingsTitle: 'Systemeinstellungen',
    ownerProfile: 'Nutzerprofil',
    language: 'Sprache',
    region: 'Region',
    wifi: 'WLAN',
    audio: 'Ton',
    formatNand: 'NAND formatieren',
    synced: 'Synchronisiert',
    writingIdb: 'Schreibe IDB...',
    nandConfigState: 'NAND-Konfiguration',
    persistedInfo: 'Gespeichert in TWL_SYSDATA (Chunks 48..79)',
    serialNumber: 'Seriennummer',
    firmware: 'Systemversion',

    healthTitle: 'Gesundheit & Sicherheit',
    healthWarning: 'Wichtige Gesundheits- und Sicherheitsinformationen',
    health3DPrecaution: 'Lege pro Stunde 3D-Spielzeit eine 10- bis 15-minütige Pause ein.',
    healthFatigueWarning: 'Unterbrich das Spielen sofort bei Ermüdung der Augen oder Unwohlsein.',
    healthNandInfo: 'Dieses virtuelle 3DS-System simuliert echte kryptografische Hardware-Partitionen.',

    activityDailyLog: 'Tägliche Schritte & Spielzeit',
    activityTodaySteps: 'Heutige Schritte',
    activityPlayCoins: 'Spielmünzen',
    activityWalkPedometer: '100 Schritte gehen (+1 Münze)',
    activitySoftwareLibrary: 'Software-Bibliothek',
    activityLaunchCount: 'Gespielt',
    activityPlayTime: 'Spielzeit',
    activityLastPlayed: 'Zuletzt gespielt',

    notesTitle: 'Spielnotizen',
    notesPen: 'Stift',
    notesEraser: 'Radierer',
    notesClear: 'Alles löschen',
    notesSaveMemo: 'Notiz speichern',
    notesSavedMemos: 'Gespeicherte Notizen',
    notesNoNotes: 'Noch keine Notizen vorhanden. Skizziere oben!',

    soundTitle: 'Nintendo 3DS Sound',
    soundSynthStudio: '8-Schritt-Synthesizer',
    soundPlay: 'Abspielen',
    soundStop: 'Stopp',
    soundTempo: 'Tempo',
    soundWaveform: 'Wellenform',

    cartScore: 'Punkte',
    cartHighScore: 'Highscore',
    cartShield: 'Schild',
    cartShoot: 'Feuern [A]',
    cartGameOver: 'SPIEL VORBEI',
    cartPressRestart: 'Drücke [A] zum Neustarten',

    miiTitle: 'Mii-Kanal',
    miiCreateNew: 'Neuen Mii erstellen',
    miiName: 'Mii-Name',
    miiGreeting: 'Begrüßung',
    miiHairStyle: 'Frisur',
    miiShirtColor: 'T-Shirt-Farbe',
    miiSaveMii: 'Mii speichern',
  },

  it: {
    open: 'Apri',
    manual: 'Manuale',
    folder: 'Cartella',
    close: 'Chiudi',
    save: 'Salva',
    back: 'Indietro',
    cancel: 'Annulla',
    returnHome: 'Torna al menu HOME',
    emptySlot: 'Vuoto',
    noCartridge: 'Nessuna scheda di gioco inserita.',
    newFolder: 'Nuova cartella',
    arrange: 'Sposta',
    swapTiles: "Tocca un'altra casella per posizionare",
    coins: 'Monete',
    steps: 'Passi',

    enabled: 'Attivo',
    disabled: 'Disattivo',
    suspended: 'Sospeso',
    soundButton: 'Audio',
    soundNotice: "Fai clic per attivare l'audio",

    homeSettings: 'Impostazioni menu HOME',
    theme: 'Tema',
    changeTheme: 'Cambia tema',
    brightness: 'Luminosità',
    iconLayout: 'Disposizione icone',
    singleRow: 'Riga singola (1x)',
    doubleRow: 'Doppia riga (2x)',
    tripleRow: 'Tripla riga (3x)',
    createFolder: 'Crea cartella',

    settingsTitle: 'Impostazioni della console',
    ownerProfile: 'Profilo utente',
    language: 'Lingua',
    region: 'Regione',
    wifi: 'Wi-Fi',
    audio: 'Audio',
    formatNand: 'Formatta NAND',
    synced: 'Sincronizzato',
    writingIdb: 'Scrittura IDB...',
    nandConfigState: 'Stato config NAND',
    persistedInfo: 'Salvato in TWL_SYSDATA (blocchi 48..79)',
    serialNumber: 'Numero di serie',
    firmware: 'Versione del sistema',

    healthTitle: 'Salute e sicurezza',
    healthWarning: 'Avvertenze importanti per la salute e la sicurezza',
    health3DPrecaution: "Fai una pausa di 10-15 minuti ogni ora di gioco in 3D.",
    healthFatigueWarning: 'Interrompi il gioco in caso di stanchezza visiva o vertigini.',
    healthNandInfo: 'Questa console virtuale emula partizioni crittografiche hardware reali.',

    activityDailyLog: 'Passi del giorno e tempo di gioco',
    activityTodaySteps: 'Passi di oggi',
    activityPlayCoins: 'Monete di gioco',
    activityWalkPedometer: 'Fai 100 passi (+1 moneta)',
    activitySoftwareLibrary: 'Libreria software',
    activityLaunchCount: 'Sessioni',
    activityPlayTime: 'Tempo di gioco',
    activityLastPlayed: 'Ultima sessione',

    notesTitle: 'Note di gioco',
    notesPen: 'Penna',
    notesEraser: 'Gomma',
    notesClear: 'Cancella tutto',
    notesSaveMemo: 'Salva nota',
    notesSavedMemos: 'Note salvate',
    notesNoNotes: 'Nessuna nota presente. Disegna in alto per crearne una!',

    soundTitle: 'Nintendo 3DS Sound',
    soundSynthStudio: 'Sintetizzatore a 8 passi',
    soundPlay: 'Riproduci',
    soundStop: 'Stop',
    soundTempo: 'Tempo',
    soundWaveform: "Forma d'onda",

    cartScore: 'Punteggio',
    cartHighScore: 'Record',
    cartShield: 'Scudo',
    cartShoot: 'Spara [A]',
    cartGameOver: 'GAME OVER',
    cartPressRestart: 'Premi [A] per ricominciare',

    miiTitle: 'Centro Mii',
    miiCreateNew: 'Crea nuovo Mii',
    miiName: 'Nome Mii',
    miiGreeting: 'Saluto',
    miiHairStyle: 'Pettinatura',
    miiShirtColor: 'Colore maglietta',
    miiSaveMii: 'Salva Mii',
  },

  ja: {
    open: 'はじめる',
    manual: '説明書',
    folder: 'フォルダ',
    close: 'とじる',
    save: '保存',
    back: 'もどる',
    cancel: 'キャンセル',
    returnHome: 'HOMEメニューにもどる',
    emptySlot: '空き',
    noCartridge: 'ゲームカードが差し込まれていません。',
    newFolder: '新しいフォルダ',
    arrange: 'ならべかえ',
    swapTiles: '移動先をタッチしてください',
    coins: 'ゲームコイン',
    steps: '歩数',

    enabled: 'ON',
    disabled: 'OFF',
    suspended: '中断中',
    soundButton: 'サウンド',
    soundNotice: 'クリックして音声を再生',

    homeSettings: 'HOMEメニュー設定',
    theme: 'テーマ',
    changeTheme: 'テーマをかえる',
    brightness: '画面の明るさ',
    iconLayout: 'アイコンの並び',
    singleRow: '1列表示',
    doubleRow: '2列表示',
    tripleRow: '3列表示',
    createFolder: 'フォルダをつくる',

    settingsTitle: '本体設定',
    ownerProfile: 'ユーザー情報',
    language: '言語',
    region: '地域',
    wifi: 'Wi-Fi',
    audio: 'サウンド',
    formatNand: '本体の初期化',
    synced: '同期済み',
    writingIdb: '保存中...',
    nandConfigState: 'NAND設定状態',
    persistedInfo: 'TWL_SYSDATAに暗号化保存 (48..79)',
    serialNumber: '製造番号',
    firmware: '本体バージョン',

    healthTitle: '安全に使用するために',
    healthWarning: '健康と安全に関する重要なお知らせ',
    health3DPrecaution: '3D映像をご利用の際は、1時間ごとに10〜15分の休憩をとってください。',
    healthFatigueWarning: '目の疲れやめまいを感じたときは、直ちに使用を中止してください。',
    healthNandInfo: 'この仮想3DSは本物のAES/RSAハードウェア暗号化パーティションをシミュレートしています。',

    activityDailyLog: '本日の歩数とプレイ記録',
    activityTodaySteps: '今日の歩数',
    activityPlayCoins: 'ゲームコイン',
    activityWalkPedometer: '100歩歩く (+1コイン)',
    activitySoftwareLibrary: 'ソフトの記録',
    activityLaunchCount: '遊んだ回数',
    activityPlayTime: 'プレイ時間',
    activityLastPlayed: '最後に遊んだ日',

    notesTitle: 'ゲームメモ',
    notesPen: 'ペン',
    notesEraser: '消しゴム',
    notesClear: 'ぜんぶ消す',
    notesSaveMemo: 'メモを保存',
    notesSavedMemos: '保存したメモ',
    notesNoNotes: 'メモはまだありません。上画面を見ながらタッチペンで描けます！',

    soundTitle: 'ニンテンドー3DSサウンド',
    soundSynthStudio: '8ステップ・シンセサイザー',
    soundPlay: '再生',
    soundStop: '停止',
    soundTempo: 'テンポ',
    soundWaveform: '波形',

    cartScore: 'スコア',
    cartHighScore: 'ハイスコア',
    cartShield: 'シールド',
    cartShoot: 'ショット [A]',
    cartGameOver: 'ゲームオーバー',
    cartPressRestart: '[A]ボタンでリトライ',

    miiTitle: 'Miiスタジオ',
    miiCreateNew: 'あたらしくつくる',
    miiName: 'Miiの名前',
    miiGreeting: 'あいさつ',
    miiHairStyle: 'かみがた',
    miiShirtColor: '服の色',
    miiSaveMii: 'Miiを保存',
  },

  pt: {
    open: 'Abrir',
    manual: 'Manual',
    folder: 'Pasta',
    close: 'Fechar',
    save: 'Salvar',
    back: 'Voltar',
    cancel: 'Cancelar',
    returnHome: 'Voltar ao Menu HOME',
    emptySlot: 'Vazio',
    noCartridge: 'Nenhum cartão de jogo inserido.',
    newFolder: 'Nova Pasta',
    arrange: 'Organizar',
    swapTiles: 'Toque em outro espaço para posicionar',
    coins: 'Moedas',
    steps: 'Passos',

    enabled: 'Ativado',
    disabled: 'Desativado',
    suspended: 'Suspenso',
    soundButton: 'Som',
    soundNotice: 'Clique para ativar o áudio',

    homeSettings: 'Definições do Menu HOME',
    theme: 'Tema',
    changeTheme: 'Mudar tema',
    brightness: 'Brilho do ecrã',
    iconLayout: 'Disposição de ícones',
    singleRow: 'Linha única (1x)',
    doubleRow: 'Linhas duplas (2x)',
    tripleRow: 'Linhas triplas (3x)',
    createFolder: 'Criar pasta',

    settingsTitle: 'Definições da Consola',
    ownerProfile: 'Perfil de Utilizador',
    language: 'Idioma',
    region: 'Região',
    wifi: 'Wi-Fi',
    audio: 'Áudio',
    formatNand: 'Formatar NAND',
    synced: 'Sincronizado',
    writingIdb: 'A gravar IDB...',
    nandConfigState: 'Estado config NAND',
    persistedInfo: 'Guardado em TWL_SYSDATA (blocos 48..79)',
    serialNumber: 'Número de série',
    firmware: 'Versão do sistema',

    healthTitle: 'Informações de Saúde e Segurança',
    healthWarning: 'Precauções importantes de saúde e segurança',
    health3DPrecaution: 'Faça uma pausa de 10 a 15 minutos por cada hora de jogo 3D.',
    healthFatigueWarning: 'Interrompa o jogo imediatamente se sentir fadiga ocular ou tonturas.',
    healthNandInfo: 'Esta consola virtual simula partições criptográficas de hardware reais.',

    activityDailyLog: 'Passos diários e tempo de jogo',
    activityTodaySteps: 'Passos de hoje',
    activityPlayCoins: 'Moedas de jogo',
    activityWalkPedometer: 'Andar 100 passos (+1 moeda)',
    activitySoftwareLibrary: 'Biblioteca de Software',
    activityLaunchCount: 'Vezes jogadas',
    activityPlayTime: 'Tempo jogado',
    activityLastPlayed: 'Última vez jogado',

    notesTitle: 'Notas de Jogo',
    notesPen: 'Caneta',
    notesEraser: 'Borracha',
    notesClear: 'Limpar tudo',
    notesSaveMemo: 'Guardar nota',
    notesSavedMemos: 'Notas guardadas',
    notesNoNotes: 'Nenhuma nota guardada. Desenhe em cima para criar uma nota!',

    soundTitle: 'Nintendo 3DS Sound',
    soundSynthStudio: 'Sintetizador de 8 passos',
    soundPlay: 'Reproduzir',
    soundStop: 'Parar',
    soundTempo: 'Tempo',
    soundWaveform: 'Forma de onda',

    cartScore: 'Pontos',
    cartHighScore: 'Recorde',
    cartShield: 'Escudo',
    cartShoot: 'Disparar [A]',
    cartGameOver: 'FIM DE JOGO',
    cartPressRestart: 'Pressione [A] para reiniciar',

    miiTitle: 'Criador Mii',
    miiCreateNew: 'Criar novo Mii',
    miiName: 'Nome do Mii',
    miiGreeting: 'Saudação',
    miiHairStyle: 'Penteado',
    miiShirtColor: 'Cor da camisa',
    miiSaveMii: 'Salvar Mii',
  },
};

export function getTranslations(lang: SupportedLanguage | undefined): SystemTranslations {
  if (!lang || !TRANSLATIONS[lang]) {
    return TRANSLATIONS.en;
  }
  return TRANSLATIONS[lang];
}

export function getLocalizedTitle(appletId: AppletId, lang: SupportedLanguage | undefined): TitleI18n {
  const selectedLang = lang && TITLES_MAP[lang] ? lang : 'en';
  const found = TITLES_MAP[selectedLang][appletId];
  if (found) return found;
  return TITLES_MAP.en[appletId];
}
