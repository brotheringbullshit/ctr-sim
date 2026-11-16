# CTR-SIM XL — Nintendo 3DS Dual-Screen & Virtual Hardware Simulator

An interactive dual-screen Nintendo 3DS XL ("CTR") hardware and Horizon OS simulator built with React, TypeScript, Tailwind CSS, Web Crypto API, IndexedDB, Web Audio API, and Three.js (WebGL).

## Key Features

- **Authentic Dual-ARM Boot Sequence (`src/bootloader/engine.ts`)**:
  - **Stage 0 (`Boot9` / `Boot11`)**: Initializes AES/RSA engines, WRAM, and 128 MB FCRAM; validates the RSA-2048 signed `NCSD_HDR` and SHA-256 partition digests before decrypting `FIRM0_BOOT1`.
  - **Stage 1 (`FIRM` Loader)**: Executes ARM9 loader vectors from WRAM, validates and decrypts `FIRM1_STAGE2` Kernel9/Kernel11 sections, and locks BootROM halves.
  - **Stage 2 (`Horizon OS`)**: Locks OTP, initializes simulated sysmodules (`Process9`, `pm`, `sm`, `fs`, `pxi`, `NS`, `ErrDisp`), mounts encrypted NAND partitions into FCRAM caches, and boots the HOME Menu.
  - Hold **SELECT** (FIRM Boot Configuration) or **START** (CTR-NAND Recovery Manager) while powering on to enter low-level boot shells.

- **Simulated CTR Memory Controller — WRAM + 128 MB FCRAM (`src/ram/fcram.ts`)**:
  - Models ARM9 internal WRAM (`0x08000000`) and 128 MB FCRAM (`0x20000000`) with hardware security latches (`boot9Locked`, `otpLocked`).
  - Caches decrypted `TWL_SYSDATA`, `CTRNAND_SYS`, and `NAND_USERDATA` in resident FCRAM so runtime reads and applet transitions do not hammer IndexedDB NAND.
  - Dynamically allocates and frees `APPMEM` process heaps, DSP PCM audio buffers, 3D banner VRAM geometry/texture budgets, and volatile applet scratchpads (`CartridgeGameApplet`, `GameNotesApplet`).
  - Live FCRAM/WRAM usage telemetry is visible inside **System Settings**.

- **AES-128-CTR + RSA-2048 Virtual NAND & CTRNAND Filesystem (`src/nand/`)**:
  - Provisions a compact **4.00 MB (256 × 16 KB chunks)** encrypted virtual NAND inside IndexedDB (`CTR_SIM_VIRTUAL_NAND_V1`) using Web Crypto (`AES-CTR` + `RSASSA-PKCS1-v1_5` + `SHA-256`).
  - Logical eMMC partition layout models `FIRM0`/`FIRM1` (Raw Binary), `CTRNAND` (FAT16), `TWLN`/`TWLP` (FAT16), and `AGBSAVE` (Raw Binary).
  - Implements the 4-part 3DS Title architecture inside `CTRNAND`:
    - **Title IDs (TID)** across retail games (`00040000`), game updates (`0004000E`), system apps (`00040010`), system applets (`00040030`), system data archives (`0004009B`), and TWLN DSiWare (`00048004`).
    - **Content Files (`.tmd` + `.app` NCCH)** stored under `/title/<TID_High>/<TID_Low>/content/` with `ExeFS`/`RomFS` metadata and SHA-256 hashes.
    - **Tickets (`.tik`)** in `/dbs/ticket.db` and **Databases** (`/dbs/title.db`, `/dbs/import.db`, `/dbs/certs.db`). Horizon OS verifies `title.db` + `.tmd`/`.app` + `.tik` before booting any title.
    - **Console Identity & Data**: `/private/movable.sed` (deriving `<ID0>` / `<ID1>`), `/rw/sys/SecureInfo_A`, `/rw/sys/LocalFriendCodeSeed_B`, and `/data/<ID0>/` (`sysdata` / `extdata`).
  - Uses serialized write queuing and incremental NCSD digest updates so saving settings, notes, Miis, tickets, or game scores is atomic and fast.

- **True 3D WebGL HOME Menu Banners (`src/components/banner3d/`, `src/components/Banner3DViewport.tsx`)**:
  - Renders real-time Three.js 3D models with dynamic lighting and cached procedural textures for every application and folder, complete with stereoscopic camera separation controlled by the physical **3D Depth Slider**.

- **Multi-Language Localization (`src/i18n/translations.ts`)**:
  - Switch between **English, Español, Français, Deutsch, Italiano, 日本語, and Português** in **System Settings**, updating labels across the HOME Menu and every applet immediately.

- **Preloaded Web Audio DSP Sound Engine (`src/audio/soundEngine.ts`)**:
  - Preloads the startup chime into decoded PCM audio buffers during boot alongside synthesized UI feedback and per-application HOME Menu banner jingles.

## Built-in Applets & Controls

- **System Settings**: Owner profile, 7-language selector, 5 HOME themes, region (`USA`/`EUR`/`JPN`), Wi-Fi & Audio toggles, live FCRAM telemetry, **Titles** inspector (Title IDs, `.tmd`/`.app` NCCH, `.tik` Ticket revoke/install, staged `import.db` finalization), **NAND FS** directory/identity browser, and NAND reflash.
- **Starburst Pilot 3D (Cartridge)**: Playable arcade shooter running out of simulated `APPMEM` with persistent high scores.
- **Game Notes**: Stylus/pointer sketchpad preserving unsaved drafts in FCRAM and saving sketches to `NAND_USERDATA`.
- **Sound Studio**: 8-step chiptune synthesizer with persistent patterns.
- **Mii Maker & Plaza**: Create and browse Mii characters.
- **Activity Log**: Tracks applet launches, playtime, Play Coins, and pedometer steps.
- **Health & Safety / Camera AR / Internet Browser**: System information and stereoscopic 3D alignment demos.

### Keyboard Shortcuts
- **Arrow Keys**: D-Pad / Circle Pad navigation (and ship movement in Starburst Pilot)
- **Enter** / **Space** (in game): **A** button
- **Escape** / **Backspace**: **B** button
- **H**: **HOME** button

## Development

```bash
npm install
npm run dev
```

Build and type-check:

```bash
npm run build
npm run lint
```
