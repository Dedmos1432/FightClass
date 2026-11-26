import Phaser from 'phaser';
import type { GameServices } from '../core/GameServices';
import { SCENES } from '../config/game';
import { WORLD } from '../config/lobby';
import { preloadCombat } from '../assets/combatAssets';
import { CombatFighterView } from '../characters/CombatFighterView';
import { CombatInput } from '../input/CombatInput';
import { loadoutFor } from '../combat/moves';
import { CombatTutorial } from '../tutorial/CombatTutorial';
import { TutorialCoach } from '../tutorial/TutorialCoach';
import { combatEffect } from '../combat/CombatEffects';
import { TutorialView } from '../ui/TutorialView';
import { RoomBackdrop } from './RoomBackdrop';
import dojoUrl from '../../assets/optimized/dojo.webp?url';

export class TutorialScene extends Phaser.Scene {
  private trainer:CombatTutorial|null=null;
  private coach:TutorialCoach|null=null;
  private view:TutorialView|null=null;
  private controls:CombatInput|null=null;
  private playerView:CombatFighterView|null=null;
  private partnerView:CombatFighterView|null=null;
  private successMs=0;
  constructor(private readonly services:GameServices) { super(SCENES.tutorial); }
  init():void { this.trainer=null; this.coach=null; this.view=null; this.controls=null; this.playerView=null; this.partnerView=null; this.successMs=0; }
  preload():void {
    if(!this.services.saves.needsTutorial) return;
    preloadCombat(this,['player','kim']);
    if(!this.textures.exists('background-dojo')) this.load.image('background-dojo',dojoUrl);
  }
  create():void {
    const step=this.services.saves.tutorialStep;
    if(step==='complete') { this.scene.start(SCENES.lobby); return; }
    if(this.loadFailed) return;
    new RoomBackdrop(this,'dojo');
    this.trainer=new CombatTutorial(step); this.view=new TutorialView(this.services);
    const coach = this.coach = new TutorialCoach(this.trainer, this.view.root.dataset.touch === 'true');
    const w=this.trainer.world,loadout=loadoutFor(this.services.saves.lobbyState.style,this.services.saves.freestyle);
    this.playerView=new CombatFighterView(this,w.player,loadout); this.partnerView=new CombatFighterView(this,w.enemy,loadout);
    this.controls=new CombatInput(()=>this.loadFailed || Boolean(this.view?.hasDialog) || this.trainer!.ready || this.trainer!.step==='club',
      slot=>coach.attack(slot),direction=>coach.dodge(direction),()=>this.pause(),()=>{w.clearInputBuffer(w.player);},()=>this.view?.root.dataset.touch==='true');
    this.view.on('#tutorial-skip','click',()=>{this.services.saves.skipTutorial();this.scene.start(SCENES.lobby);});
    this.view.on('#tutorial-finish','click',()=>{if(this.trainer?.step==='club'){this.services.saves.advanceTutorial('club');this.scene.start(SCENES.lobby);}});
    this.view.on('#tutorial-pause','click',()=>this.pause());
    this.view.on('.brand','click',event=>{event.preventDefault();this.pause();});
    this.view.showLesson(step); this.view.update(this.trainer,coach.cue,1);
    this.resize(this.scale.gameSize); this.scale.on(Phaser.Scale.Events.RESIZE,this.resize,this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      this.controls?.destroy(); this.playerView?.destroy(); this.partnerView?.destroy(); this.view?.destroy();
      this.scale.off(Phaser.Scale.Events.RESIZE,this.resize,this); this.trainer=null; this.coach=null; this.view=null;
    });
  }
  private get loadFailed():boolean {return document.querySelector<HTMLElement>('#ui')?.dataset.screen==='load-error';}
  update(_time:number,delta:number):void {
    const t=this.trainer,v=this.view,coach=this.coach;
    if(!t || !v || !coach || this.loadFailed) return;
    const paused=v.hasDialog || document.hidden,dt=Math.min(50,delta);
    if(paused) {
      this.tweens.timeScale=0;
      v.update(t,coach.cue,0);
      return;
    }
    const frame=coach.frame(dt,this.controls?.direction??0,this.controls?.block??false,this.controls?.autoBlock??false);
    const simDelta=dt*frame.timeScale;
    this.tweens.timeScale=frame.timeScale;
    if(simDelta>0) {
      t.world.player.direction=frame.direction;
      t.world.player.blocking=frame.blocking;
      t.world.player.autoGuard=frame.autoGuard;
      t.update(simDelta);
      for(const event of t.world.events)combatEffect(this,this.services,event);
    }
    this.playerView?.update(simDelta);this.partnerView?.update(simDelta);
    if(t.ready) {
      this.successMs+=dt;
      if(this.successMs>=700) {
        this.services.saves.advanceTutorial(t.step);const step=this.services.saves.tutorialStep;
        if(step!=='complete') {this.controls?.clear();t.enter(step);v.showLesson(step);this.successMs=0;}
      }
    }
    v.update(t,coach.cue,frame.timeScale);
  }
  private pause():void {
    if(!this.view || this.view.hasDialog || this.loadFailed) return;
    this.controls?.clear();this.view.showPause(()=>this.scene.start(SCENES.menu));
  }
  private resize(size:Phaser.Structs.Size):void {
    this.cameras.main.setViewport(0,0,size.width,size.height).setZoom(Math.min(size.width/WORLD.width,size.height/WORLD.height)).centerOn(WORLD.width/2,WORLD.height/2);
  }
}
