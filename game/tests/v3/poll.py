"""Bounded polling for implementation arrival; exits when API stubs disappear."""
import datetime, pathlib, subprocess, time
root = pathlib.Path(__file__).resolve().parents[2]
logs = root / 'tests/v3/runs'
logs.mkdir(exist_ok=True)
deadline = time.monotonic() + 90 * 60
while time.monotonic() < deadline:
    time.sleep(180)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    result = subprocess.run(['npx', 'vitest', 'run', 'tests/v3'], cwd=root, capture_output=True, text=True, timeout=120)
    output = result.stdout + result.stderr
    (logs / f'{stamp}.log').write_text(output)
    (root / 'tests/v3/latest-run.log').write_text(output)
    summary = '\n'.join(line for line in output.splitlines() if 'Tests ' in line or 'Test Files ' in line)
    print(f'{stamp} exit={result.returncode}\n{summary}', flush=True)
    if 'not implemented yet' not in output:
        print('Implementation arrived; classify remaining failures.', flush=True)
        break
else:
    print('Polling deadline reached.', flush=True)
