# Three Subdivide

Smooth subdivision surface modifier for use with three.js BufferGeometry. This modifier uses the [Loop](https://en.wikipedia.org/wiki/Loop_subdivision_surface) (Charles Loop, 1987) subdivision surface algorithm to smooth modern three.js [BufferGeometry](https://threejs.org/docs/?q=geometry#api/en/core/BufferGeometry).

## Example

- [Check out Loop Subdivision in action!](https://stevinz.github.io/three-subdivide)

## Info

At one point, [three.js](https://threejs.org/) included a subdivision surface modifier in the extended examples, it was removed in r125. This modifier was originally based on the [Catmull-Clark](https://en.wikipedia.org/wiki/Catmull%E2%80%93Clark_subdivision_surface) algorithm, which works best for geometry with convex coplanar n-gon faces. In three.js r60 the modifier was changed to use the Loop algorithm, which was designed to work better with triangle based meshes.

The Loop algorithm, however, doesn't always provide uniform results as the vertices are skewed toward 
the most used vertex positions. A triangle based box (like BoxGeometry for example) will favor the corners.
To alleviate this issue, this implementation includes an initial pass to split coplanar faces at their
shared edges. It starts by splitting along the longest shared edge first, and then from that midpoint it
splits to any remaining coplanar shared edges. This can be disabled by passing 'split' as false.

Also by default, this implementation inserts new uv coordinates, but does not average them using the Loop
algorithm. In some cases (usually in round-ish geometries), this will produce undesired results, a noticeable
tearing will occur. In such cases, try passing 'uvSmooth' as true to enable uv averaging.

## Usage

This code creates a cube with smoothed geometry and adds it to a Scene.

    import * as THREE from 'three';
    import { LoopSubdivision } from 'LoopSubdivision.js';

    const geometry = LoopSubdivision.apply(new THREE.BoxGeometry());

    const material = new THREE.MeshNormalMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    const scene = new THREE.Scene();
    scene.add(mesh);

----
## License

Subdivide is released under the terms of the MIT license, so it is free to use in your free or commercial projects.

Copyright (c) 2022 Stephens Nunnally <@stevinz>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.