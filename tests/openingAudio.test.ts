import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const menu = readFileSync(join(root, 'src', 'scenes', 'MainMenuScene.ts'), 'utf8');
const iso = readFileSync(join(root, 'src', 'scenes', 'IsoScene.ts'), 'utf8');

describe('FP-01 opening audio contract', () => {
  it('turns the browser audio gesture into a deliberate scored entrance', () => {
    expect(menu).toContain("this.load.audio('music_menu', 'audio/LCR_music_menu.m4a')");
    expect(menu).toContain("this.load.audio('shell_ui_click', 'audio/sfx_the_bureau_receiver_click.wav')");
    expect(menu).toContain("'ENTER BRASSMERE'");
    expect(menu).toContain("this.sound.once('unlocked', beginScore)");
    expect(menu).toContain("this.sound.unlock()");
    expect(menu).toMatch(/targets: this\.menuMusic, volume, duration: 900/);
  });

  it('shares the score cache with gameplay and applies menu volume changes live', () => {
    expect(menu).not.toContain('shell_music_menu');
    expect(menu).toContain("this.sound.add('music_menu'");
    expect(menu).toContain('setMasterVolume: (v) => { this.menuMasterVolume = v; this.syncMenuMusicVolume(); }');
    expect(menu).toContain('setMusicVolume: (v) => { this.menuMusicVolume = v; this.syncMenuMusicVolume(); }');
    expect(menu).toContain('this.tweens.killTweensOf(this.menuMusic)');
    expect(menu).toContain('this.menuMusic.volume = this.menuScoreVolume()');
  });

  it('ships the two physical shell clips referenced by the menu', () => {
    expect(existsSync(join(root, 'public', 'audio', 'LCR_music_menu.m4a'))).toBe(true);
    expect(existsSync(join(root, 'public', 'audio', 'sfx_the_bureau_receiver_click.wav'))).toBe(true);
  });

  it('acknowledges successful opening move and shakedown orders before their world impacts', () => {
    const extort = iso.slice(iso.indexOf('private commandExtortBusiness('), iso.indexOf('private extortBusyThugIds('));
    const move = iso.slice(iso.indexOf('private commandMove('), iso.indexOf('// ── COMBAT PR A', iso.indexOf('private commandMove(')));
    expect(extort).toContain('this.confirmUnit(thug);');
    expect(move).toContain('if (res.moved.length > 0) this.confirmUnitIds(res.moved);');
  });

  it('names a newly selected actor and gives selection VO lower priority than an order', () => {
    const select = iso.slice(iso.indexOf('private commandSelect('), iso.indexOf('private commandContextual('));
    expect(select).toContain("this.confirmUnit(hit, 'selection')");
    expect(select).toContain('this.crewOrderLabel(this.selection.ids)');
  });

  it('keeps the opening tip behind unlock and schedules it after the command acknowledgement', () => {
    const create = iso.slice(iso.indexOf('  create(): void'), iso.indexOf('  private buildObjective('));
    const hideLegend = iso.slice(iso.indexOf('  private hideLegend('));
    const extortionEvents = iso.slice(iso.indexOf('  private processExtortionEvents('), iso.indexOf('  private flashConverted('));
    expect(iso).toContain('if (!this.pause.paused && !this.legend?.visible)');
    expect(create).not.toContain("this.fireTipOnce('extort')");
    expect(hideLegend).not.toContain("this.fireTipOnce('extort')");
    expect(extortionEvents).toContain("this.fireTipOnce('extort')");
    const fireTip = iso.slice(iso.indexOf('  private fireTipOnce('), iso.indexOf('// ── the build verbs', iso.indexOf('  private fireTipOnce(')));
    expect(fireTip).toContain("this.sound.once('unlocked', () => { this.tipUnlockQueued.delete(which); this.fireTipOnce(which); })");
    expect(fireTip).toContain('if (played) this.tipsFired.add(which);');
  });

  it('lets first grease/launder lessons speak before generic confirmations', () => {
    const reinvest = iso.slice(iso.indexOf('  private commandReinvest('), iso.indexOf('  private greasePressure('));
    const grease = iso.slice(iso.indexOf('  private commandGrease('), iso.indexOf('  private fireTipOnce('));
    expect(reinvest).toContain("if (!this.fireTipOnce('launder')) this.audio?.confirm();");
    expect(grease).toContain("if (!this.fireTipOnce('grease')) this.audio?.confirm();");
    expect(reinvest.indexOf("fireTipOnce('launder')")).toBeLessThan(reinvest.indexOf('this.audio?.confirm()'));
    expect(grease.indexOf("fireTipOnce('grease')")).toBeLessThan(grease.indexOf('this.audio?.confirm()'));
  });

  it('uses negative audio for lost turf and reserves confirmation for a successful defense', () => {
    const tickWar = iso.slice(iso.indexOf('  private tickWar('), iso.indexOf('  private contestPresence('));
    expect(tickWar).toMatch(/if \(o\.flipped\).*this\.audio\?\.wire\('crisis'\)/s);
    expect(tickWar).not.toMatch(/if \(o\.flipped\).*this\.audio\?\.confirm\(\)/);
    expect(tickWar).toMatch(/if \(o\.ended === 'held'\).*this\.audio\?\.confirm\(\)/s);
  });
});
