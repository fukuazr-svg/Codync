"""ACP fixture exercising Codync's isolated browser through the real computer MCP."""
import json
import os
import re
import subprocess
import sys
import time
import traceback
from pathlib import Path

sessions = {}


def send(value):
    print(json.dumps(value), flush=True)


def call_tool(request, name, arguments, checkpoint):
    reply = request('tools/call', {'name': name, 'arguments': arguments})
    progress = {'tool': name, 'keys': sorted(reply), 'isError': reply.get('isError', False), 'contentType': type(reply.get('content')).__name__}
    checkpoint('tool-result', progress)
    text = reply['content'][0]['text']
    if reply.get('isError'):
        return False, text
    return True, json.loads(text)


def binding(start):
    return {
        'operationId': start['target']['operationId'],
        'browserId': start['target']['browserId'],
        'tabId': start['target']['tabId'],
        'generation': start['target']['generation'],
    }


def prompt(message):
    params = message['params']
    session = sessions[params['sessionId']]
    cwd = Path(session['cwd'])
    text = params['prompt'][0]['text']
    match = re.search(r'https?://[^\s]+', text)
    assert match, f'supply a page URL: {text}'
    url = match.group(0).rstrip('.,)')
    tool = next(server for server in session['mcpServers'] if server['name'] == 'computer')
    results = {'mode': None}
    progress = {'stage': 'spawn-mcp'}

    def checkpoint(stage, detail=None):
        progress['stage'] = stage
        progress['at'] = time.time()
        if detail is not None:
            progress['detail'] = detail
        (cwd / 'browser-progress.json').write_text(json.dumps(progress, indent=2))

    checkpoint('spawn-mcp')
    with open(cwd / 'browser-mcp.log', 'w', encoding='utf-8') as mcp_log, subprocess.Popen(
        [tool['command'], *tool['args']],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=mcp_log,
        text=True,
        env=os.environ.copy(),
    ) as mcp:
        sequence = 0

        def request(method, arguments):
            nonlocal sequence
            sequence += 1
            checkpoint(f'request:{method}')
            mcp.stdin.write(json.dumps({'jsonrpc': '2.0', 'id': sequence, 'method': method, 'params': arguments}) + '\n')
            mcp.stdin.flush()
            line = mcp.stdout.readline()
            assert line, f'MCP exited before replying to {method}'
            checkpoint(f'line:{method}', {'line': line[:2048]})
            message = json.loads(line)
            checkpoint(f'parsed:{method}', {'keys': sorted(message), 'error': message.get('error')})
            reply = message['result']
            checkpoint(f'reply:{method}')
            return reply

        request('initialize', {
            'protocolVersion': '2025-06-18',
            'capabilities': {},
            'clientInfo': {'name': 'browser-test', 'version': '1'},
        })
        names = {item['name'] for item in request('tools/list', {})['tools']}
        needed = {'browser_start', 'browser_navigate', 'browser_click', 'browser_type', 'browser_screenshot', 'browser_stop'}
        assert needed <= names, names
        checkpoint('tools-ready')

        def tool(name, arguments):
            checkpoint(f'tool:{name}:request')
            ok, value = call_tool(request, name, arguments, checkpoint)
            checkpoint(f'tool:{name}:reply', {'ok': ok, 'error': None if ok else value})
            return ok, value

        ok, start = tool('browser_start', {'url': url})
        assert ok, start
        bound = binding(start)
        results['start'] = start
        results['mode'] = 'happy' if 'browser-happy' in text else 'takeover' if 'browser-takeover' in text else 'stop'
        checkpoint('start-complete', {'mode': results['mode']})

        if results['mode'] == 'happy':
            ok, reused = tool('browser_start', {'url': url})
            assert ok and reused['reused'] is True, reused
            assert binding(reused) == bound, (reused, bound)
            results['reusedStart'] = reused
            checkpoint('reuse-complete')

            stale = dict(bound, generation='00000000-0000-0000-0000-000000000000')
            ok, stale_error = tool('browser_click', dict(stale, selector='#count'))
            assert not ok and 'browser target changed' in stale_error, (ok, stale_error)
            results['staleError'] = stale_error
            checkpoint('stale-complete')

            ok, click = tool('browser_click', dict(bound, selector='#count'))
            assert ok, click
            results['click'] = click
            checkpoint('click-complete')
            ok, typed = tool('browser_type', dict(bound, selector='#name', text='Codync'))
            assert ok, typed
            results['type'] = typed
            checkpoint('type-complete')
            ok, shot = tool('browser_screenshot', bound)
            assert ok, shot
            results['screenshot'] = shot
            checkpoint('screenshot-complete')
            ok, closed = tool('browser_stop', bound)
            assert ok, closed
            results['stop'] = closed
            checkpoint('stop-complete')
            ok, post_stop_error = tool('browser_type', dict(bound, selector='#name', text='must-not-land'))
            assert not ok and 'no longer running' in post_stop_error, (ok, post_stop_error)
            results['postStopError'] = post_stop_error
            checkpoint('post-stop-complete')
        else:
            (cwd / 'browser-active.json').write_text(json.dumps(bound))
            time.sleep(2)
            if results['mode'] == 'takeover':
                ok, error = tool('browser_click', dict(bound, selector='#count'))
                assert not ok, ok
                results['guardError'] = error
            else:
                ok, error = tool('browser_type', dict(bound, selector='#name', text='must-not-land'))
                assert not ok, ok
                results['cancelError'] = error

        (cwd / 'browser-results.json').write_text(json.dumps(results, indent=2))
        checkpoint('results-written')
        mcp.stdin.close()
    send({
        'jsonrpc': '2.0',
        'method': 'session/update',
        'params': {
            'sessionId': params['sessionId'],
            'update': {'sessionUpdate': 'agent_message_chunk', 'content': {'type': 'text', 'text': 'Browser operation complete.'}},
        },
    })
    return {'stopReason': 'end_turn'}


for line in sys.stdin:
    message = json.loads(line)
    method = message.get('method')
    if method == 'initialize':
        result = {'protocolVersion': 1, 'agentCapabilities': {'loadSession': True}}
    elif method in ['session/new', 'session/load']:
        session_id = message['params'].get('sessionId', f'browser-test-{len(sessions)}')
        sessions[session_id] = message['params']
        result = {'sessionId': session_id}
    elif method == 'session/prompt':
        try:
            result = prompt(message)
        except Exception as error:
            cwd = Path(sessions[message['params']['sessionId']]['cwd'])
            (cwd / 'browser-error.json').write_text(
                json.dumps({'type': type(error).__name__, 'message': str(error), 'traceback': traceback.format_exc()}, indent=2),
                encoding='utf-8',
            )
            raise
    else:
        continue
    send({'jsonrpc': '2.0', 'id': message['id'], 'result': result})
