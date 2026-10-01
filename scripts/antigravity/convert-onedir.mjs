#!/usr/bin/env node
/**
 * convert-onedir.mjs — one-time PyInstaller "onefile -> onedir" conversion for
 * Google's Antigravity ACP bridge (agy_acp_server.exe / .par).
 *
 * Why: agy_acp_server ships as a PyInstaller onefile. On every spawn the
 * bootloader unpacks its embedded runtime (python310.dll + ~8.3k binaries,
 * ~312 MB) into a fresh %TEMP%\_MEI* dir before it can answer the ACP
 * `initialize` request. On Windows that is ~15-20 s per process. This script
 * materialises those extractable entries once, beside the exe, and marks them
 * as already-on-disk so the bootloader skips the unpack (initialize -> ~3 s).
 *
 * Root cause + measurements + upstream thread:
 *   scripts/antigravity/README.md
 *   https://discuss.ai.google.dev/t/acp-server-1-1-1-official-agy-acp-server-cold-starts-in-16s-on-every-windows-spawn/183427/3
 *
 * Usage (Windows):
 *   node scripts/antigravity/convert-onedir.mjs --inspect [--exe <path>]
 *   node scripts/antigravity/convert-onedir.mjs --convert [--exe <path>] [--force]
 *   node scripts/antigravity/convert-onedir.mjs --restore [--exe <path>]
 *
 * Zero dependencies (node:fs/zlib only). Fail-closed: any parse anomaly aborts
 * without writing.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

// ---------------------------------------------------------------------------
// PyInstaller CArchive constants (from PyInstaller/archive/readers.py and
// bootloader/src/pyi_archive.{h,c}).
// ---------------------------------------------------------------------------
const COOKIE_MAGIC = Buffer.from([0x4d, 0x45, 0x49, 0x0c, 0x0b, 0x0a, 0x0b, 0x0e]);
const COOKIE_LENGTH = 88; // !8sIIII64s
const TOC_ENTRY_HEADER = 18; // !IIIIBc
const ON_DISK_TYPECODE = "#";
// Typecodes the bootloader treats as "extractable" (onefile / merge semantics).
const EXTRACTABLE = new Set(["b", "x", "Z", "n", "d"]);
// Typecodes that stay inside the exe (read from archive, never unpacked).
const KEPT_IN_ARCHIVE = new Set(["z", "m", "s", "o", "M", "l"]);

const TYPECODE_NAMES = {
	b: "binary",
	d: "dependency",
	z: "pyz",
	Z: "zipfile",
	M: "pypackage",
	m: "pymodule",
	s: "pysource",
	x: "data",
	o: "runtime-option",
	l: "splash",
	n: "symlink",
	[ON_DISK_TYPECODE]: "on-disk",
};

function die(msg) {
	console.error(`error: ${msg}`);
	process.exit(1);
}

function parseArgs(argv) {
	const out = { mode: "inspect", exe: null, force: false, contentsDir: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--inspect") out.mode = "inspect";
		else if (a === "--convert") out.mode = "convert";
		else if (a === "--restore") out.mode = "restore";
		else if (a === "--force") out.force = true;
		else if (a === "--exe") out.exe = argv[++i];
		else if (a === "--contents-dir") out.contentsDir = argv[++i];
		else if (a === "-h" || a === "--help") out.help = true;
		else die(`unknown argument: ${a}`);
	}
	return out;
}

function defaultExe() {
	const candidates = [
		process.env.AGY_ACP_BIN,
		process.env.LOCALAPPDATA
			? path.join(process.env.LOCALAPPDATA, "agy-acp-server", "agy_acp_server.exe")
			: null,
		process.env.HOME
			? path.join(process.env.HOME, "Library", "agy-acp-server", "agy_acp_server.par")
			: null,
		process.env.HOME
			? path.join(process.env.HOME, ".local", "bin", "agy_acp_server.par")
			: null,
	].filter(Boolean);
	for (const c of candidates) if (fs.existsSync(c)) return c;
	return candidates[candidates.length - 1] ?? "agy_acp_server.exe";
}

// ---------------------------------------------------------------------------
// Archive parsing
// ---------------------------------------------------------------------------
function readArchive(exePath) {
	const buf = fs.readFileSync(exePath);
	const magicOff = buf.lastIndexOf(COOKIE_MAGIC);
	if (magicOff < 0) die(`no PyInstaller cookie magic found in ${exePath} (not a PyInstaller archive?)`);
	if (magicOff + COOKIE_LENGTH > buf.length) die("cookie magic too close to EOF");

	const cookieEnd = magicOff + COOKIE_LENGTH;
	const pkgLength = buf.readUInt32BE(magicOff + 8);
	const tocOffset = buf.readUInt32BE(magicOff + 12);
	const tocLength = buf.readUInt32BE(magicOff + 16);
	const pythonVersion = buf.readUInt32BE(magicOff + 20);
	const pythonLib = buf
		.slice(magicOff + 24, magicOff + 88)
		.toString("utf8")
		.replace(/\0.*$/, "");
	const pkgStart = cookieEnd - pkgLength;
	const tocAbs = pkgStart + tocOffset;
	if (tocAbs < 0 || tocAbs + tocLength > buf.length) die("TOC bounds outside file");

	// Walk entries.
	const entries = [];
	let p = tocAbs;
	const tocEnd = tocAbs + tocLength;
	while (p < tocEnd) {
		if (p + TOC_ENTRY_HEADER > buf.length) die("TOC entry header runs past EOF (fail-closed)");
		const entryLength = buf.readUInt32BE(p);
		if (entryLength < TOC_ENTRY_HEADER) die(`implausible entry_length ${entryLength} at 0x${p.toString(16)}`);
		const nameLen = entryLength - TOC_ENTRY_HEADER;
		if (p + TOC_ENTRY_HEADER + nameLen > buf.length) die("TOC entry name runs past EOF (fail-closed)");
		const typecode = String.fromCharCode(buf[p + 17]);
		const name = buf
			.slice(p + 18, p + 18 + nameLen)
			.toString("utf8")
			.replace(/\0.*$/, "");
		entries.push({
			tocEntryOffset: p,
			typecodeOffset: p + 17,
			nameOffset: p + 18,
			entryLength,
			offset: buf.readUInt32BE(p + 4),
			dataLength: buf.readUInt32BE(p + 8),
			uncompressedLength: buf.readUInt32BE(p + 12),
			compressionFlag: buf[p + 16],
			typecode,
			name,
		});
		p += entryLength;
	}
	if (p !== tocEnd) die("TOC walk did not land exactly on tocEnd (fail-closed)");

	return { buf, exePath, pkgStart, tocAbs, tocLength, pkgLength, pythonVersion, pythonLib, entries };
}

function isExtractable(typecode) {
	return EXTRACTABLE.has(typecode);
}

function isRecognized(typecode) {
	return (
		EXTRACTABLE.has(typecode) ||
		KEPT_IN_ARCHIVE.has(typecode) ||
		typecode === ON_DISK_TYPECODE
	);
}

function readEntryData(archive, entry) {
	const start = archive.pkgStart + entry.offset;
	const raw = archive.buf.slice(start, start + entry.dataLength);
	if (entry.compressionFlag === 1) return zlib.inflateSync(raw);
	return raw;
}

function summarize(archive) {
	const counts = {};
	for (const e of archive.entries) counts[e.typecode] = (counts[e.typecode] ?? 0) + 1;
	const extractable = archive.entries.filter((e) => isExtractable(e.typecode));
	const totalUncompressed = extractable.reduce((s, e) => s + e.uncompressedLength, 0);
	return { counts, extractable, totalUncompressed };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
function cmdInspect(args) {
	const exePath = args.exe ?? defaultExe();
	if (!fs.existsSync(exePath)) die(`exe not found: ${exePath}`);
	const arch = readArchive(exePath);
	const { counts, extractable, totalUncompressed } = summarize(arch);

	console.log(`exe:            ${exePath}`);
	console.log(`size:           ${(arch.buf.length / 1048576).toFixed(1)} MB`);
	console.log(`pkg start:      0x${arch.pkgStart.toString(16)} (${arch.pkgStart})`);
	console.log(`pkg length:     ${arch.pkgLength}`);
	console.log(`python:         ${arch.pythonVersion} (${arch.pythonLib})`);
	console.log(`toc:            ${arch.entries.length} entries, ${arch.tocLength} bytes`);
	console.log("");
	console.log("typecodes:");
	for (const [tc, n] of Object.entries(counts).sort()) {
		const tag =
			tc === ON_DISK_TYPECODE
				? "already on disk"
				: isExtractable(tc)
					? "extractable"
					: KEPT_IN_ARCHIVE.has(tc)
						? "kept in archive"
						: "unknown";
		console.log(`  ${tc}  ${String(n).padStart(5)}  ${TYPECODE_NAMES[tc] ?? "?"} (${tag})`);
	}
	const unknown = arch.entries.filter((e) => !isRecognized(e.typecode));
	if (unknown.length > 0) {
		console.log("");
		console.log(`WARNING: ${unknown.length} entries with unrecognised typecode(s) — not safe to convert.`);
		for (const e of unknown.slice(0, 5)) console.log(`   ${e.typecode} ${e.name}`);
	} else {
		console.log("");
		console.log(`extractable:    ${extractable.length} entries -> ${(totalUncompressed / 1048576).toFixed(1)} MB unpacked`);
		console.log(`already-done:   ${arch.entries.some((e) => e.typecode === ON_DISK_TYPECODE) ? "yes (some entries already '#')" : "no"}`);
		console.log("");
		console.log("Inspect OK. Run with --convert to apply.");
	}
	return arch;
}

function cmdConvert(args) {
	const exePath = args.exe ?? defaultExe();
	if (!fs.existsSync(exePath)) die(`exe not found: ${exePath}`);
	if (!args.exe) die("refusing to convert the auto-detected install without --exe <path> (safety)");

	const backupPath = `${exePath}.bak`;
	if (fs.existsSync(backupPath) && !args.force) {
		die(`backup already exists: ${backupPath} (pass --force to overwrite)`);
	}

	const arch = readArchive(exePath);
	const { extractable } = summarize(arch);
	const unknown = arch.entries.filter((e) => !isRecognized(e.typecode));
	if (unknown.length > 0) die(`unrecognised typecodes present (${unknown.map((e) => e.typecode).join(",")}); not converting`);
	if (extractable.length === 0) die("nothing to convert: no extractable entries (already converted?)");

	// 1. Backup.
	fs.copyFileSync(exePath, backupPath);
	console.log(`backup:         ${backupPath}`);

	// 2. Extract extractable entries into _internal/ beside the exe, preserving
	//    archive-internal paths. Symlinks ('n') are recreated as copies.
	const contentsDir = args.contentsDir ?? path.join(path.dirname(exePath), "_internal");
	fs.mkdirSync(contentsDir, { recursive: true });

	const byName = new Map(arch.entries.map((e) => [e.name.toLowerCase(), e]));
	let written = 0;
	let bytes = 0;
	for (const e of extractable) {
		const dest = path.join(contentsDir, e.name);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		if (e.typecode === "n") {
			// Symlink: entry data is the link target name; copy the target's bytes.
			const targetName = readEntryData(arch, e).toString("utf8").replace(/\0.*$/, "");
			const target = byName.get(targetName.toLowerCase());
			if (!target) die(`symlink ${e.name} -> ${targetName} target not found`);
			fs.writeFileSync(dest, readEntryData(arch, target));
		} else {
			const data = readEntryData(arch, e);
			if (data.length !== e.uncompressedLength) {
				die(`short extract for ${e.name}: got ${data.length}, expected ${e.uncompressedLength}`);
			}
			fs.writeFileSync(dest, data);
		}
		written++;
		bytes += e.uncompressedLength;
	}
	console.log(`extracted:      ${written} files -> ${(bytes / 1048576).toFixed(1)} MB in ${contentsDir}`);

	// 3. Rewrite the extractable entries' typecodes to '#'. Same width, so the
	//    archive length, TOC length and data offsets are untouched.
	const patched = Buffer.from(arch.buf);
	for (const e of extractable) {
		patched[e.typecodeOffset] = ON_DISK_TYPECODE.charCodeAt(0);
	}

	// 4. Atomic replace.
	const tmpPath = `${exePath}.tmp-${process.pid}`;
	fs.writeFileSync(tmpPath, patched);
	fs.rmSync(exePath);
	fs.renameSync(tmpPath, exePath);

	const after = readArchive(exePath);
	const afterCounts = summarize(after).counts;
	console.log(`patched:        ${extractable.length} entries marked '#', exe size unchanged (${patched.length} bytes)`);
	console.log(`verify:         typecodes now ${JSON.stringify(afterCounts)}`);
	console.log("");
	console.log("Converted. Test with: node scripts/antigravity/convert-onedir.mjs --inspect --exe " + exePath);
	console.log("Rollback:    node scripts/antigravity/convert-onedir.mjs --restore --exe " + exePath);
}

function cmdRestore(args) {
	const exePath = args.exe ?? defaultExe();
	const backupPath = `${exePath}.bak`;
	if (!fs.existsSync(backupPath)) die(`no backup to restore: ${backupPath}`);
	fs.copyFileSync(backupPath, exePath);
	const contentsDir = path.join(path.dirname(exePath), "_internal");
	if (fs.existsSync(contentsDir)) {
		fs.rmSync(contentsDir, { recursive: true, force: true });
		console.log(`removed:        ${contentsDir}`);
	}
	console.log(`restored:       ${exePath} <- ${backupPath}`);
}

// ---------------------------------------------------------------------------
function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log("usage: convert-onedir.mjs [--inspect | --convert | --restore] [--exe <path>] [--force] [--contents-dir <path>]");
		return;
	}
	if (args.mode === "inspect") cmdInspect(args);
	else if (args.mode === "convert") cmdConvert(args);
	else if (args.mode === "restore") cmdRestore(args);
}

main();
