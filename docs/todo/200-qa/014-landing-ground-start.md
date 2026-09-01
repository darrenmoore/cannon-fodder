# 014 -- landing ground: enemy starts too close

> map: landing ground
> enemy started way too close to me

## Findings

Same defect as [010](010-spawn-distance.md), second witness: the nearest `E`
is **6.0 tiles** from a squad `P` (veteran hunter aggro is 11.9t -- 3
riflemen inside it at t=0), and that post is `enemySpawns[0]`, the first
anchor veteran's `extraEnemies` doubles, so a second man can land ~3.6 tiles
from the squad.

## Classification

Broken, cause shared with 010, resolved by 010's rule. **Decision (Q3):
12 tiles.**

## Plan

No separate work: 010's validator will flag this map and 010's fix pass
moves the posts. This file exists so the specific map gets verified.

## Done when

- Landing ground passes 010's distance rule, and a veteran playtest opening
  survives the first 3 seconds without contact.
