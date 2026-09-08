#!/usr/bin/env python3
"""
Scenario generator for Attack Chain Reanalysis (take-home).

Produces synthetic security-telemetry scenarios: ~500 events dominated by
benign noise, seeded with a small set of "interesting" events.

  Scenario 1 (attack-chain-01):  one real, coherent attack chain. Correct
                                  answer is a chain; the seeded events are the
                                  planted attack (the answer key).
  Scenario 2 (benign-lookalike-02): a false-positive trap. The seeded events
                                  each RESEMBLE an attack technique but are
                                  individually benign and do NOT form a chain.
                                  Correct answer is "no attack".

Design contract (deterministic and reproducible):
  * Event schema: id, timestamp, source, target, type, detail   (FR-002)
  * Types limited to: process_start, network_connection, authentication, file_access
  * Every seeded event names TWO DISTINCT assets, so a downstream edge can cite
    it and pass "event involves both endpoints" validation.       (FR-006)
  * Attack-only external IPs never appear in noise; hosts/users are reused in
    noise so scenarios cannot be solved by asset name alone.
  * IDs are assigned in timestamp order after merge, so seeded events are
    scattered among the noise by ID.

Run:  python3 generate.py                 # scenario 1 (default)
      python3 generate.py --scenario 2    # scenario 2
      python3 generate.py --scenario 2 --out DIR
"""

import argparse
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ----------------------------------------------------------------------------
# Knobs
# ----------------------------------------------------------------------------
TOTAL_EVENTS = 500          # FR-001: approximately 500 events

DAY = datetime(2026, 9, 5, tzinfo=timezone.utc)      # incident date
NOISE_START = DAY + timedelta(hours=7, minutes=30)   # 07:30Z
NOISE_END = DAY + timedelta(hours=17, minutes=30)    # 17:30Z

ALLOWED_TYPES = {"process_start", "network_connection", "authentication", "file_access"}

# ----------------------------------------------------------------------------
# Assets
# ----------------------------------------------------------------------------
# Attack-only external IPs for scenario 1 (never used in noise or scenario 2)
ATTACKER_C2 = "203.0.113.47"
ATTACKER_EXFIL = "198.51.100.22"

# Assets reused across attack and benign noise
COMPROMISED_USER = "jsmith"
ESCALATED_USER = "administrator"
WORKSTATION = "WKSTN-042"
FILE_SERVER = "FILESRV-01"
DOMAIN_CONTROLLER = "DC-01"

# Benign population
BENIGN_USERS = [
    "jsmith", "mjones", "apatel", "kdurand", "lchen", "rgarcia", "twhite",
    "administrator", "svc_backup", "svc_sql", "svc_monitor", "hokonkwo",
    "bmurphy", "yamamoto", "eschmidt", "nsingh",
]
BENIGN_HOSTS = (
    [f"WKSTN-{i:03d}" for i in range(1, 61)]      # WKSTN-001..060 (incl. 042)
    + ["FILESRV-01", "FILESRV-02", "DC-01", "DC-02", "MAIL-01", "WEB-01",
       "PRINT-01", "SQL-01", "BUILD-01", "VPN-01"]
)
INTERNAL_IPS = [f"10.0.{s}.{h}" for s in (1, 2, 3, 10, 20) for h in (5, 12, 25, 40, 88, 130, 201)]
# Benign external services (documentation / well-known-ish; NOT the attacker IPs)
BENIGN_EXTERNAL = [
    "20.190.128.10 (login.microsoftonline.com)",
    "13.107.42.14 (office365)",
    "140.82.112.3 (github)",
    "151.101.1.140 (fastly-cdn)",
    "8.8.8.8 (dns)",
    "104.18.32.47 (cloudflare)",
    "17.253.144.10 (apple-updates)",
    "142.250.72.14 (google)",
]

# ----------------------------------------------------------------------------
# Benign detail templates
# ----------------------------------------------------------------------------
BENIGN_PROCESS = [
    "chrome.exe started by explorer.exe",
    "Teams.exe started",
    "OUTLOOK.EXE started by explorer.exe",
    "Code.exe started",
    "svchost.exe -k netsvcs spawned",
    "MsMpEng.exe scheduled scan started",
    "gpupdate.exe /force",
    "python.exe nightly_report.py",
    "excel.exe started",
    "slack.exe started",
    "OneDrive.exe sync process started",
    "msedge.exe started by explorer.exe",
]
BENIGN_NETWORK_EXT = [
    "Outbound HTTPS to {ext}",
    "TLS session established to {ext}",
    "Software update check to {ext}",
]
BENIGN_NETWORK_INT = [
    "SMB read from \\\\{host}\\Shared over 445",
    "Outbound 443 to {ip}",
    "LDAP query to {host} on 389",
    "Print job submitted to PRINT-01 on 9100",
    "RDP session to {host} on 3389",
]
BENIGN_AUTH = [
    "Kerberos logon succeeded for {user}",
    "Interactive logon for {user} succeeded",
    "Service ticket (TGS) issued for {user}",
    "Failed logon (bad password) for {user}",
    "Screen unlock for {user}",
    "svc_backup scheduled-task logon succeeded",
]
BENIGN_FILE = [
    "Read \\\\{host}\\Shared\\weekly_report.docx",
    "Write C:\\Users\\{user}\\Documents\\notes.txt",
    "Read \\\\FILESRV-02\\Projects\\roadmap.pptx",
    "Modified \\\\{host}\\Shared\\budget_draft.xlsx",
    "Opened C:\\Users\\{user}\\Downloads\\invoice.pdf",
    "Read \\\\FILESRV-01\\Shared\\onboarding.pdf",
]


def iso(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def make_noise_event(rng: random.Random) -> dict:
    """One benign event with a random timestamp inside the business day."""
    ts = NOISE_START + timedelta(seconds=rng.randint(0, int((NOISE_END - NOISE_START).total_seconds())))
    etype = rng.choices(
        ["process_start", "network_connection", "authentication", "file_access"],
        weights=[30, 34, 22, 14],
    )[0]
    user = rng.choice(BENIGN_USERS)
    host = rng.choice(BENIGN_HOSTS)

    if etype == "process_start":
        source, target = user, host
        detail = rng.choice(BENIGN_PROCESS)
    elif etype == "network_connection":
        if rng.random() < 0.55:
            source = host
            target = rng.choice(BENIGN_EXTERNAL)
            detail = rng.choice(BENIGN_NETWORK_EXT).format(ext=target)
        else:
            source = host
            target = rng.choice([h for h in BENIGN_HOSTS if h != host])
            ip = rng.choice(INTERNAL_IPS)
            detail = rng.choice(BENIGN_NETWORK_INT).format(host=target, ip=ip)
    elif etype == "authentication":
        source, target = user, rng.choice(BENIGN_HOSTS + ["DC-01", "DC-02"])
        detail = rng.choice(BENIGN_AUTH).format(user=user)
    else:  # file_access
        source, target = user, rng.choice(["FILESRV-01", "FILESRV-02", host])
        detail = rng.choice(BENIGN_FILE).format(host=target, user=user)

    return {"_ts": ts, "_attack": False, "_seeded": False, "_reason": None,
            "type": etype, "source": source, "target": target, "detail": detail}


def _seed_event(minutes_after_9, etype, source, target, detail, attack, reason=None):
    assert etype in ALLOWED_TYPES, etype
    assert source != target, f"seeded event must span two assets: {detail}"
    return {"_ts": DAY + timedelta(hours=9) + timedelta(minutes=minutes_after_9),
            "_attack": attack, "_seeded": True, "_reason": reason,
            "type": etype, "source": source, "target": target, "detail": detail}


def build_attack_chain() -> list:
    """Scenario 1: one real, coherent attack chain. Each step spans two assets."""
    steps = [
        (14, "authentication", ATTACKER_C2, WORKSTATION,
         "Interactive logon for jsmith succeeded via external RDP gateway from 203.0.113.47"),
        (15, "process_start", COMPROMISED_USER, WORKSTATION,
         "powershell.exe -enc <base64> spawned by OUTLOOK.EXE"),
        (15, "network_connection", WORKSTATION, ATTACKER_C2,
         "Outbound HTTPS beacon to 203.0.113.47:443, 1.2KB every 60s"),
        (18, "process_start", COMPROMISED_USER, WORKSTATION,
         "cmd.exe /c whoami /all & net group \"Domain Admins\" /domain"),
        (22, "process_start", COMPROMISED_USER, WORKSTATION,
         "rundll32.exe comsvcs.dll MiniDump lsass.exe (credential dump)"),
        (25, "authentication", WORKSTATION, DOMAIN_CONTROLLER,
         "Kerberos TGT requested for administrator using harvested NTLM hash (pass-the-hash)"),
        (27, "authentication", WORKSTATION, FILE_SERVER,
         "Network logon to FILESRV-01 as administrator succeeded"),
        (28, "network_connection", WORKSTATION, FILE_SERVER,
         "SMB session established to FILESRV-01:445"),
        (30, "process_start", ESCALATED_USER, FILE_SERVER,
         "cmd.exe spawned via wmiprvse.exe (remote WMI execution)"),
        (33, "file_access", ESCALATED_USER, FILE_SERVER,
         "Read \\\\FILESRV-01\\Finance\\Q3_forecast.xlsx"),
        (34, "file_access", ESCALATED_USER, FILE_SERVER,
         "Read \\\\FILESRV-01\\HR\\employee_ssn_export.csv"),
        (36, "file_access", ESCALATED_USER, FILE_SERVER,
         "Created archive C:\\Windows\\Temp\\backup.7z (staging)"),
        (40, "network_connection", FILE_SERVER, ATTACKER_EXFIL,
         "Outbound TLS to 198.51.100.22:443, 480MB transferred"),
        (42, "network_connection", FILE_SERVER, ATTACKER_C2,
         "Outbound HTTPS to 203.0.113.47:443 signalling task complete"),
        (45, "process_start", ESCALATED_USER, FILE_SERVER,
         "wevtutil.exe cl Security (clearing Windows Security log)"),
        (46, "file_access", ESCALATED_USER, FILE_SERVER,
         "Deleted C:\\Windows\\Temp\\backup.7z"),
    ]
    return [_seed_event(m, t, s, d, det, attack=True) for (m, t, s, d, det) in steps]


def build_lookalikes() -> list:
    """Scenario 2: a benign lookalike. Each seeded event resembles an attack
    technique but is individually explainable, and they are spread across
    unrelated assets and times so they form NO coherent chain. Correct answer:
    no attack. The reason string documents why each is benign (for the reviewer).

    Steps: (minutes_after_9, type, source, target, detail, reason)."""
    steps = [
        (-45, "authentication", "192.0.2.20 (corp-vpn-gateway)", "WKSTN-017",
         "Interactive logon for kdurand via corporate VPN gateway, MFA satisfied",
         "Resembles external RDP access, but it is a known admin on the corporate VPN with MFA."),
        (10, "process_start", "svc_sccm", "WKSTN-023",
         "powershell.exe -File C:\\ProgramData\\SCCM\\inventory.ps1 (Microsoft-signed)",
         "Resembles PowerShell payload execution, but it is the signed SCCM inventory task."),
        (35, "network_connection", "WKSTN-031", "52.96.0.20 (outlook.office365.com)",
         "Periodic HTTPS check-in to office365, ~2KB every 60s",
         "Resembles C2 beaconing, but the destination is Microsoft 365 and cadence is normal."),
        (70, "process_start", "svc_edr", "SQL-01",
         "MsMpEng.exe opened a handle to lsass.exe during scheduled AV scan",
         "Resembles LSASS credential access, but it is Microsoft Defender scanning."),
        (95, "authentication", "svc_backup", "FILESRV-02",
         "Network logon for svc_backup succeeded during nightly backup window",
         "Resembles a lateral-movement service logon, but it is the backup service account on schedule."),
        (110, "network_connection", "BACKUP-01", "20.150.44.10 (blob.core.windows.net Azure)",
         "Scheduled cloud backup upload, 512GB to Azure Blob Storage",
         "Resembles large-volume exfiltration, but it is the nightly backup to the known Azure tenant."),
        (130, "file_access", "apatel", "FILESRV-01",
         "Read \\\\FILESRV-01\\Finance\\Q3_forecast.xlsx",
         "Resembles data collection, but apatel is in Finance and this is their own file."),
        (150, "file_access", "hokonkwo", "FILESRV-01",
         "Read \\\\FILESRV-01\\HR\\employee_roster.csv",
         "Resembles HR data theft, but hokonkwo is in HR and routinely reads the roster."),
        (175, "process_start", "svc_monitor", "DC-01",
         "wevtutil.exe el (enumerate log names) by monitoring agent",
         "Resembles log tampering, but it only enumerates logs read-only; nothing is cleared."),
        (200, "authentication", "WKSTN-005", "DC-01",
         "Kerberos TGT for administrator during the approved Tuesday patch window (MFA)",
         "Resembles credential abuse, but it is an admin during the scheduled patch window with MFA."),
        (240, "network_connection", "WKSTN-044", "140.82.112.3 (github)",
         "git push over HTTPS 443, 40MB to corporate GitHub org",
         "Resembles outbound exfiltration, but it is a developer pushing code to GitHub."),
        (300, "process_start", "lchen", "WKSTN-050",
         "cmd.exe /c whoami (run during a helpdesk troubleshooting call)",
         "Resembles host discovery, but it is a single benign command during a support call."),
        (360, "network_connection", "WEB-01", "FILESRV-02",
         "SMB session to FILESRV-02:445 for scheduled web asset sync",
         "Resembles lateral movement, but it is a documented app-to-fileserver content sync."),
        (400, "authentication", "rgarcia", "FILESRV-01",
         "Network logon for rgarcia succeeded (Finance share access)",
         "Resembles unauthorized access, but rgarcia is in Finance and uses this share daily."),
        (430, "file_access", "svc_backup", "FILESRV-01",
         "Created archive E:\\Backups\\finance_2026-09-05.7z (nightly backup job)",
         "Resembles data staging, but it is the scheduled backup job writing to the backup volume."),
        (455, "process_start", "eschmidt", "WKSTN-012",
         "rundll32.exe shell32.dll,OpenAs_RunDLL (Windows 'Open with' dialog)",
         "Resembles a malicious rundll32 proxy, but it is the normal Windows shell handler."),
    ]
    return [_seed_event(m, t, s, d, det, attack=False, reason=r)
            for (m, t, s, d, det, r) in steps]


SCENARIOS = {
    1: {
        "id": "attack-chain-01",
        "name": "Finance file-server exfiltration",
        "type": "attack",
        "seed": 1337,
        "builder": build_attack_chain,
    },
    2: {
        "id": "benign-lookalike-02",
        "name": "Benign lookalike (busy IT night, no attack)",
        "type": "benign",
        "seed": 2026,
        "builder": build_lookalikes,
    },
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", type=int, choices=(1, 2), default=1)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    cfg = SCENARIOS[args.scenario]
    out = args.out or (Path(__file__).resolve().parents[3]
                       / "data/scenarios" / cfg["id"])

    rng = random.Random(cfg["seed"])
    seeded = cfg["builder"]()
    noise = [make_noise_event(rng) for _ in range(TOTAL_EVENTS - len(seeded))]

    merged = seeded + noise
    merged.sort(key=lambda e: (e["_ts"], 0 if e["_seeded"] else 1))

    events, attack_ids, lookalikes = [], [], []
    for i, e in enumerate(merged, start=1):
        eid = f"E-{i:04d}"
        if e["_attack"]:
            attack_ids.append(eid)
        elif e["_seeded"]:
            lookalikes.append({"id": eid, "type": e["type"],
                               "source": e["source"], "target": e["target"],
                               "detail": e["detail"], "why_benign": e["_reason"]})
        events.append({
            "id": eid,
            "timestamp": iso(e["_ts"]),
            "source": e["source"],
            "target": e["target"],
            "type": e["type"],
            "detail": e["detail"],
        })

    # ---- validation -------------------------------------------------------
    ids = [e["id"] for e in events]
    assert len(ids) == len(set(ids)) == TOTAL_EVENTS, "duplicate or wrong-count IDs"
    assert all(e["timestamp"] <= events[i + 1]["timestamp"] for i, e in enumerate(events[:-1]))
    for e in events:
        assert e["type"] in ALLOWED_TYPES, e
        assert all(e[f] for f in ("id", "timestamp", "source", "target", "type", "detail"))
    seeded_ids = set(attack_ids) | {l["id"] for l in lookalikes}
    for e in events:
        if e["id"] in seeded_ids:
            assert e["source"] != e["target"], f"seeded event {e['id']} does not span two assets"
    # scenario-1 attacker IPs never leak into any scenario's noise
    for e in events:
        if e["id"] not in seeded_ids:
            assert ATTACKER_C2 not in (e["source"], e["target"])
            assert ATTACKER_EXFIL not in (e["source"], e["target"])

    answer_key = {
        "scenario_id": cfg["id"],
        "scenario_name": cfg["name"],
        "scenario_type": cfg["type"],                 # "attack" | "benign"
        "correct_answer": ("one attack chain" if cfg["type"] == "attack"
                           else "no attack"),
        "generated_by": "generate-scenario skill",
        "seed": cfg["seed"],
        "total_events": len(events),
        "attack_event_count": len(attack_ids),
        "attack_event_ids": attack_ids,
    }

    if cfg["type"] == "attack":
        answer_key["assets_involved"] = sorted(
            {WORKSTATION, FILE_SERVER, DOMAIN_CONTROLLER, COMPROMISED_USER,
             ESCALATED_USER, ATTACKER_C2, ATTACKER_EXFIL})
        answer_key["chain_summary"] = [
            "External RDP logon to WKSTN-042 as jsmith (initial access)",
            "PowerShell payload execution and C2 beacon to 203.0.113.47",
            "Local discovery and LSASS credential dump on WKSTN-042",
            "Pass-the-hash to DC-01, then admin logon to FILESRV-01 (lateral movement)",
            "Remote execution and reading of Finance/HR files on FILESRV-01 (collection)",
            "480MB exfiltration to 198.51.100.22, then log-clearing cleanup",
        ]
        answer_key["note"] = (
            "Removing FILESRV-01 should collapse the exfiltration edges but leave "
            "the credential-theft path (WKSTN-042 -> DC-01) intact.")
    else:
        answer_key["lookalike_event_count"] = len(lookalikes)
        answer_key["lookalike_event_ids"] = [l["id"] for l in lookalikes]
        answer_key["lookalikes"] = lookalikes
        answer_key["note"] = (
            "There is no attack. Each lookalike event resembles a technique but is "
            "individually benign, and they share no pivot host, credential, or "
            "external destination. A correct analysis draws no attack chain (or only "
            "dashed, unverified fragments), never a connected intrusion.")

    out.mkdir(parents=True, exist_ok=True)
    (out / "events.json").write_text(json.dumps(events, indent=2) + "\n")
    (out / "answer_key.json").write_text(json.dumps(answer_key, indent=2) + "\n")

    label = f"{len(attack_ids)} attack" if cfg["type"] == "attack" else f"{len(lookalikes)} lookalike, 0 attack"
    print(f"[scenario {args.scenario}] wrote {len(events)} events ({label}) to {out}")
    if attack_ids:
        print("Attack IDs:", ", ".join(attack_ids))
    if lookalikes:
        print("Lookalike IDs:", ", ".join(l["id"] for l in lookalikes))


if __name__ == "__main__":
    main()
