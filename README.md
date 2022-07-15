# Subdivide

This modifier uses the [Loop](https://en.wikipedia.org/wiki/Loop_subdivision_surface) (Charles Loop, 1987) subdivision surface algorithm to smooth modern three.js [BufferGeometry](https://threejs.org/docs/?q=geometry#api/en/core/BufferGeometry).

## Example

- [Check out Loop Subdivision in action!]()

## Info

At one point, [three.js](https://threejs.org/) included a subdivision surface modifier in the extended examples, it was removed in r125. This modifier was originally based on the [Catmull-Clark](https://en.wikipedia.org/wiki/Catmull%E2%80%93Clark_subdivision_surface) algorithm, which works best for geometry with convex coplanar n-gon faces. The modifier was changed to use the Loop algorithm in three.js r60, which was designed to work better with triangle based geometry.

The Loop algorithm, however, doesn't always provide uniform results as the vertices are skewed toward 
the most used vertex positions. A triangle based box (like BoxGeometry for example) will favor the corners.
To alleviate this issue, this implementation includes an initial pass to split coplanar faces at their
shared edges. It starts by splitting along the longest shared edge first, and then from that midpoint it
splits to any remaining coplanar shared edges. This can be disabled by passing 'split' as false.

Also by default, this implementation inserts new uv coordinates, but does not average them using the Loop
algorithm. In some cases (usually in round-ish geometries), this will produce undesired results, a noticeable
tearing will occur. In such cases, try passing 'uvSmooth' as true to enable uv averaging.

## Usage

    import { LoopSubdivisiuon } from 'LoopSubdivision.js';