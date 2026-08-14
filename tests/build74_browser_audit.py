#!/usr/bin/env python3
"""End-to-end mobile audit for FlipCast's edition-aware game flow."""

import json
import shutil
import subprocess
import tempfile
import time
import urllib.request

import websocket


PORT = 19274
URL = "http://127.0.0.1:8787/"


def wait_json(url, timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                return json.load(response)
        except Exception:
            time.sleep(0.1)
    raise RuntimeError(f"Timed out waiting for {url}")


def main():
    profile = tempfile.mkdtemp(prefix="flipcast-build74-audit-")
    chrome = subprocess.Popen(
        [
            shutil.which("chromium-browser") or shutil.which("chromium"),
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--remote-allow-origins=*",
            f"--remote-debugging-port={PORT}",
            f"--user-data-dir={profile}",
            "--window-size=390,844",
            URL,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        targets = wait_json(f"http://127.0.0.1:{PORT}/json/list")
        page = next(target for target in targets if target["type"] == "page")
        ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=10)
        seq = 0

        def command(method, params=None):
            nonlocal seq
            seq += 1
            ws.send(json.dumps({"id": seq, "method": method, "params": params or {}}))
            while True:
                message = json.loads(ws.recv())
                if message.get("id") == seq:
                    if "error" in message:
                        raise RuntimeError(message["error"])
                    return message.get("result", {})

        def evaluate(expression):
            result = command(
                "Runtime.evaluate",
                {"expression": expression, "awaitPromise": True, "returnByValue": True},
            )
            if result.get("exceptionDetails"):
                raise RuntimeError(result["exceptionDetails"])
            return result["result"].get("value")

        command("Page.enable")
        command("Runtime.enable")
        command("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
        evaluate("new Promise(r => document.readyState === 'complete' ? r() : addEventListener('load', r, {once:true}))")

        evaluate(
            """localStorage.setItem('seven-up-scorekeeper-v1', JSON.stringify({players:[{id:'a',name:'Alice',createdAt:new Date().toISOString()},{id:'b',name:'Bob',createdAt:new Date().toISOString()}],games:[{id:'old',playerIds:['a','b'],target:200,rounds:[],status:'active',createdAt:new Date().toISOString()}],activeGameId:'old'}))"""
        )
        command("Page.reload", {"ignoreCache": True})
        time.sleep(0.5)
        evaluate(
            """
            (async () => {
              const sleep = ms => new Promise(r => setTimeout(r, ms));
              const wait = async test => { for (let i=0;i<80;i++){ const value=test(); if(value)return value; await sleep(25); } throw new Error('UI wait timed out'); };
              const clickText = async text => { const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes(text)); if(!button)throw new Error(`Missing button: ${text}`); button.click(); await sleep(40); };
              const assert = (condition, message) => { if(!condition)throw new Error(message); };
              await wait(()=>document.body.textContent.includes('Resume game'));
              assert(document.body.textContent.includes('Classic · Round 1'), 'legacy game did not default to Classic');
              await clickText('Resume game');
              assert(document.body.textContent.includes('Flip 7 · First to 200'), 'legacy scoreboard lost classic edition');
              await clickText('Score round');
              await clickText('Enter cards');
              assert([...document.querySelectorAll('.number')].some(b=>b.textContent.trim()==='0'), 'classic calculator lost zero');
              assert(document.querySelector('.double') && !document.querySelector('.divided'), 'classic modifiers are wrong');
              return true;
            })()
            """
        )
        evaluate("localStorage.removeItem('seven-up-scorekeeper-v1')")
        command("Page.reload", {"ignoreCache": True})
        time.sleep(0.5)
        audit = evaluate(
            """
            (async () => {
              const sleep = ms => new Promise(r => setTimeout(r, ms));
              const wait = async test => { for (let i=0;i<80;i++){ const value=test(); if(value)return value; await sleep(25); } throw new Error('UI wait timed out'); };
              const clickText = async text => { const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().includes(text)); if(!button)throw new Error(`Missing button: ${text}`); button.click(); await sleep(40); };
              const setInput = (selector, value) => { const input=document.querySelector(selector); input.value=value; input.dispatchEvent(new Event('input',{bubbles:true})); };
              const assert = (condition, message) => { if(!condition)throw new Error(message); };
              await wait(()=>document.body.textContent.includes('New game'));
              await clickText('New game');
              assert(document.body.textContent.includes('With a Vengeance'), 'edition chooser missing Vengeance');
              await clickText('With a Vengeance');
              assert(document.body.textContent.includes('Flip 7: With a Vengeance'), 'setup edition badge missing');
              setInput('#newPlayer','Alice'); document.querySelector('#addPlayer').requestSubmit(); await sleep(40);
              setInput('#newPlayer','Bob'); document.querySelector('#addPlayer').requestSubmit(); await sleep(40);
              await clickText('Start game');
              assert(document.body.textContent.includes('Flip 7: With a Vengeance · First to 200'), 'Vengeance ruleset was not persisted');
              await clickText('Score round');
              const cards=document.querySelectorAll('.score-card');
              cards[0].querySelector('.expand-calculator').click(); await sleep(40);
              const first=document.querySelectorAll('.score-card')[0];
              assert(![...first.querySelectorAll('.number')].some(b=>b.textContent.trim()==='0'), 'Vengeance showed classic zero');
              assert([...first.querySelectorAll('.number')].some(b=>b.textContent.trim()==='13'), 'Vengeance omitted 13');
              for (const n of ['8','11','13']) [...first.querySelectorAll('.number')].find(b=>b.textContent.trim()===n).click();
              first.querySelector('.divided').click();
              first.querySelector('[data-penalty="4"]').click(); await sleep(40);
              assert(document.querySelectorAll('.score-card')[0].querySelector('.score-value').textContent.trim()==='12', 'Vengeance operation order failed');
              const current=document.querySelectorAll('.score-card')[0];
              current.querySelector('.special-zero').click(); await sleep(40);
              assert(document.querySelectorAll('.score-card')[0].querySelector('.score-value').textContent.trim()==='0', 'The Zero failed');
              document.querySelectorAll('.score-card')[0].querySelector('.flip').click(); await sleep(40);
              assert(document.querySelectorAll('.score-card')[0].querySelector('.score-value').textContent.trim()==='15', 'The Zero plus Flip 7 failed');
              document.querySelectorAll('.score-card')[1].querySelector('.bust').click(); await sleep(40);
              await clickText('Save round');
              assert(document.body.textContent.includes('1 round completed'), 'round did not save');
              const saved=JSON.parse(localStorage.getItem('seven-up-scorekeeper-v1'));
              assert(saved.games.at(-1).ruleset==='vengeance', 'saved game lost ruleset');
              assert(saved.games.at(-1).rounds[0].scores[saved.games.at(-1).playerIds[0]]===15, 'saved Vengeance score is wrong');
              const overflow=document.documentElement.scrollWidth > document.documentElement.clientWidth;
              return {legacy:'classic', vengeanceScore:15, ruleset:saved.games.at(-1).ruleset, viewport:[innerWidth,innerHeight], overflow};
            })()
            """
        )
        if audit["overflow"]:
            raise RuntimeError("390px viewport has horizontal overflow")
        print(json.dumps(audit, sort_keys=True))
        ws.close()
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=5)
        except subprocess.TimeoutExpired:
            chrome.kill()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
