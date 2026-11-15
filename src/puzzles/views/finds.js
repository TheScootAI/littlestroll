// The finds on screen: each piece of clothing lying at its spot on the ground, turned to a fixed angle
// that differs from spot to spot, and hidden for good once it is found (it is worn by whoever found it,
// see player/avatar.js). Scenery only: it reads S.finds and nothing else.
import { Group } from 'three';
import { SITES, heightAt } from '../../world/layout.js';
import { lyingProp } from '../../player/wardrobe.js';

export function createView(scene) {
  const root = new Group();
  root.name = 'finds-view';
  scene.add(root);
  const props = SITES.finds.map(([x, z], i) => {
    const g = lyingProp(i);
    g.position.set(x, heightAt(x, z), z);
    g.rotation.y = 0.7 + i * 2.399963;   // the golden angle: a different turn at every spot, the same in both browsers
    root.add(g);
    return g;
  });
  return {
    sync(finds) {
      props.forEach((g, i) => { g.visible = !(Array.isArray(finds) && (finds[i] === 0 || finds[i] === 1)); });
    },
  };
}
