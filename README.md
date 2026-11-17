# CTR-SIM XL — Nintendo 3DS Dual-Screen & Virtual Hardware Simulator

An interactive dual-screen Nintendo 3DS XL ("CTR") hardware and Horizon OS simulator built with React, TypeScript, Tailwind CSS, Web Crypto API, IndexedDB, Web Audio API, and Three.js (WebGL).

## Key Features

- **Authentic Dual-ARM Boot Sequence (`src/bootloader/engine.ts`)**:
  - **Stage 0 (`Boot9` / `Boot11`)**: Initializes AES/RSA engines, derives CTR nonces from `SHA-256(NAND_CID)`, validates the Sector 0 NCSD RSA-2048 signature over `0x100..0x1FF` (`SIM_BOOT9_NAND_KEY`) and decrypts the TWL MBR at `0x1BE..0x1FF` (`0x55 0xAA` via Keyslot `0x03`), then decrypts `FIRM0` (with automatic failover to `FIRM1` if `FIRM0` is corrupt).
  - **Stage 1 (`NATIVE_FIRM` Loader)**: Executes ARM9 loader vectors from WRAM (`0x08006000`), maps Kernel9/Kernel11 sections, and locks Boot9/Boot11 protected halves.
  - **Stage 2 (`Horizon OS`)**: Locks OTP, initializes simulated sysmodules (`Process9`, `pm`, `sm`, `fs`, `pxi`, `NS`, `ErrDisp`), mounts encrypted eMMC partitions (`TWL`, `AGBSAVE`, `CTRNAND`) into FCRAM caches, and boots the HOME Menu.
  - Hold **SELECT** (FIRM Boot Configuration — encrypted/decrypted 4.00 MB NAND `.bin` dump & restore plus `CTR-SIM-KEYBUNDLE-V2` / `aeskeydb.bin` CID + keyslot export/import) or **START** (CTR-NAND Recovery Manager) while powering on to enter low-level boot shells.

- **Simulated CTR Memory Controller — WRAM + 128 MB FCRAM (`src/ram/fcram.ts`)**:
  - Models ARM9 internal WRAM (`0x08000000`) and 128 MB FCRAM (`0x20000000`) with hardware security latches (`boot9Locked`, `otpLocked`).
  - Caches decrypted `CTRNAND` (`/rw/sys/`, `/title/`, `/dbs/`, `/data/<ID0>/`) in resident FCRAM so runtime reads and applet transitions do not hammer IndexedDB NAND.
  - Dynamically allocates and frees `APPMEM` process heaps, DSP PCM audio buffers, 3D banner VRAM geometry/texture budgets, and volatile applet scratchpads (`CartridgeGameApplet`, `GameNotesApplet`).
  - Live FCRAM/WRAM usage telemetry is visible inside **System Settings**.

- **Authentic eMMC Partition Geometry & CID-Derived AES-128-CTR (`src/nand/`)**:
  - Keeps IndexedDB backing storage and `.bin` dumps compact at **4.00 MB (256 × 16 KB chunks = 8,192 media units)** so the browser stays fast while modeling the real Old3DS eMMC partition layout (`0x3AF00000`):

| NCSD Entry | Partition | Real Old3DS Offset | Real Old3DS Size | Filesystem | Keyslot (CID CTR) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Sector 0 | `NCSD_HDR` + TWL MBR | `0x00000000` | `0x200` | Raw Binary | RSA-2048 (`0x100..0x1FF`) + `0x03` (`0x1BE..0x1FF`) |
| `NCSD[0]` | `TWL` (`TWLN` + `TWLP`) | `0x0` (`TWLN 0x12E00`, `TWLP 0x09011A00`) | `0x0B100000` | FAT16 + FAT12 | `0x03` (TWL byte-reversed CID CTR) |
| `NCSD[1]` | `AGBSAVE` | `0x0B100000` | `0x00030000` (192 KB) | Raw Binary | `0x07` |
| `NCSD[2]` | `FIRM0` (`NATIVE_FIRM`) | `0x0B130000` | `0x00400000` (4 MiB) | Raw Binary | `0x06` |
| `NCSD[3]` | `FIRM1` (Failover Backup) | `0x0B530000` | `0x00400000` (4 MiB) | Raw Binary | `0x06` |
| `NCSD[4]` | `CTRNAND` | `0x0B930000` | `0x2F5D0000` (~757 MiB) | FAT16 | `0x04` (Old3DS CID CTR) |

  - **`CTRNAND` is an authentic MBR + FAT16 filesystem (`src/nand/fat16.ts`, Volume Label `"CTR"`)**: Sector 0 contains a real MBR partition table (`0x06` FAT16, `0x55 0xAA`), followed at LBA 1 by a spec-compliant FAT16 VBR/BPB (`512B` clusters, `5,678` clusters, FAT1/FAT2 chains, VFAT LFN + 8.3 directories) storing the actual operating system and applet files directly on the disk image:
    - **Title IDs (TID)** across retail games (`00040000`), game updates (`0004000E`), system apps (`00040010`), system applets (`00040030`), system data archives (`0004009B`), and TWLN DSiWare (`00048004`).
    - **Content Files (`.tmd` + `.app` NCCH)** stored under `/title/<TID_High>/<TID_Low>/content/` with `NCCH` headers (`0x100`), `ExeFS`/`RomFS` metadata, and applet descriptors reconstructed directly from FAT16 on boot.
    - **Tickets (`.tik`)** in `/dbs/ticket.db` and **Databases** (`/dbs/title.db`, `/dbs/import.db`, `/dbs/certs.db`). Horizon OS verifies `title.db` + `.tmd`/`.app` + `.tik` before booting any title.
    - **Console Identity & Data**: `/private/movable.sed` (`"SEED"`), `/rw/sys/SecureInfo_A` (`"CTR-SINF"`), `/rw/sys/LocalFriendCodeSeed_B` (`"LFCS"`), `/rw/sys/config.json`, and `/data/<ID0>/` (`sysdata` / `extdata`).

- **True 3D WebGL HOME Menu Banners (`src/components/banner3d/`, `src/components/Banner3DViewport.tsx`)**:
  - Renders real-time Three.js 3D models with dynamic lighting and cached procedural textures for every application and folder, complete with stereoscopic camera separation controlled by the physical **3D Depth Slider**.

- **Multi-Language Localization (`src/i18n/translations.ts`)**:
  - Switch between **English, Español, Français, Deutsch, Italiano, 日本語, and Português** in **System Settings**, updating labels across the HOME Menu and every applet immediately.

- **Preloaded Web Audio DSP Sound Engine (`src/audio/soundEngine.ts`)**:
  - Preloads the startup chime into decoded PCM audio buffers during boot alongside synthesized UI feedback and per-application HOME Menu banner jingles.

## Built-in Applets & Controls

- **System Settings**: Owner profile, 7-language selector, 5 HOME themes, region (`USA`/`EUR`/`JPN`), Wi-Fi & Audio toggles, live FCRAM telemetry, **Titles** inspector (Title IDs, `.tmd`/`.app` NCCH, `.tik` Ticket revoke/install, staged `import.db` finalization), **NAND FS** directory/CID/partition browser, and NAND reflash.
- **Starburst Pilot 3D (Cartridge)**: Playable arcade shooter running out of simulated `APPMEM` with persistent high scores.
- **Game Notes**: Stylus/pointer sketchpad preserving unsaved drafts in FCRAM and saving sketches to CTRNAND `/data/<ID0>/`.
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
