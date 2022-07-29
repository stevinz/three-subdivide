/** /////////////////////////////////////////////////////////////////////////////////
//
// @description Loop Subdivision Surface
// @about       Smooth subdivision surface modifier for use with three.js BufferGeometry
// @author      Stephens Nunnally <@stevinz>
// @license     MIT - Copyright (c) 2022 Stephens Nunnally and Scidian Software
// @source      https://github.com/stevinz/three-subdivide
//
//      See end of file for license details and acknowledgements
//
///////////////////////////////////////////////////////////////////////////////////*/
//
//  Functions
//      modify              Applies Loop subdivision to BufferGeometry, returns new BufferGeometry
//      edgeSplit           Splits all triangles at edges shared by coplanar triangles
//      flat                One iteration of Loop subdivision, without point averaging
//      smooth              One iteration of Loop subdivision, with point averaging
//
//  Info
//      This modifier uses the Loop (Charles Loop, 1987) subdivision surface algorithm to smooth
//      modern three.js BufferGeometry.
//
//      At one point, three.js included a subdivision surface modifier in the extended examples (see bottom
//      of file for links), it was removed in r125. This modifier was originally based on the Catmull-Clark
//      algorithm, which works best for geometry with convex coplanar n-gon faces. In three.js r60 the modifier
//      was changed to use the Loop algorithm, which was designed to work better with triangle based meshes.
//
//      The Loop algorithm, however, doesn't always provide uniform results as the vertices are skewed toward
//      the most used vertex positions. A triangle based box (e.g. BoxGeometry) will favor the corners. To
//      alleviate this issue, this implementation includes an initial pass to split coplanar faces at their
//      shared edges. It starts by splitting along the longest shared edge first, and then from that midpoint it
//      splits to any remaining coplanar shared edges. This can be disabled by passing 'split' as false.
//
//      Also by default, this implementation inserts new uv coordinates, but does not average them using the Loop
//      algorithm. In some cases (often in flat geometries) this will produce undesired results, a
//      noticeable tearing will occur. In such cases, try passing 'uvSmooth' as true to enable uv averaging.
//
//  Note(s)
//      - This modifier returns a new BufferGeometry instance, it does not dispose() of the old geometry.
//
//      - This modifier returns a NonIndexed geometry. An Indexed geometry can be created by using the
//        BufferGeometryUtils.mergeVertices() function, see:
//        https://threejs.org/docs/?q=buffer#examples/en/utils/BufferGeometryUtils.mergeVertices
//
//      - This modifier works best with geometry whose triangles share edges AND edge vertices. See diagram below.
//
//          OKAY          NOT OKAY
//            O              O
//           /|\            / \
//          / | \          /   \
//         /  |  \        /     \
//        O---O---O      O---O---O
//         \  |  /        \  |  /
//          \ | /          \ | /
//           \|/            \|/
//            O              O
//
/////////////////////////////////////////////////////////////////////////////////////

import * as THREE from 'three';

///// Constants

const POSITION_DECIMALS = 2;

///// Local Variables

const _average = new THREE.Vector3();
const _center = new THREE.Vector3();
const _midpoint = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _temp = new THREE.Vector3();
const _vector0 = new THREE.Vector3(); // .Vector4();
const _vector1 = new THREE.Vector3(); // .Vector4();
const _vector2 = new THREE.Vector3(); // .Vector4();
const _vec0to1 = new THREE.Vector3();
const _vec1to2 = new THREE.Vector3();
const _vec2to0 = new THREE.Vector3();
const _position = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
];
const _vertex = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
];
const _triangle = new THREE.Triangle();

/////////////////////////////////////////////////////////////////////////////////////
/////   Loop Subdivision Surface
/////////////////////////////////////////////////////////////////////////////////////

/** Loop subdivision surface modifier for use with modern three.js BufferGeometry */
class LoopSubdivision {

    /////////////////////////////////////////////////////////////////////////////////////
    /////   Modify
    ////////////////////

    /**
     * Applies Loop subdivision modifier to geometry
     *
     * @param {Object} bufferGeometry - Three.js geometry to be subdivided
     * @param {Number} iterations - How many times to run subdividion
     * @param {Boolean} split - Should coplanar faces be divided along shared edges before running Loop subdivision
     * @param {Boolean} uvSmooth - Should UV values be averaged during subdivision
     * @param {Boolean} flatOnly - If true, subdivision generates triangles, but does not modify positions
     * @param {Number} maxTriangles - If geometry contains more than this many triangles, subdivision will not contiunue
     * @returns {Object} Returns new, subdivided, three.js BufferGeometry object
    */
    static modify(bufferGeometry, iterations = 1, split = true, uvSmooth = false, flatOnly = false, maxTriangles = Infinity) {

        ///// Geometries
        if (! verifyGeometry(bufferGeometry)) return bufferGeometry;
        let modifiedGeometry = bufferGeometry.clone();

        ///// Presplit
        if (split) {
            const splitGeometry = LoopSubdivision.edgeSplit(modifiedGeometry)
            modifiedGeometry.dispose();
            modifiedGeometry = splitGeometry;
        }

        ///// Apply Subdivision
        for (let i = 0; i < iterations; i++) {
            let currentTriangles = modifiedGeometry.attributes.position.count / 3;
            if (currentTriangles < maxTriangles) {
                let subdividedGeometry;
                if (flatOnly) {
                    subdividedGeometry = LoopSubdivision.flat(modifiedGeometry);
                } else {
                    subdividedGeometry = LoopSubdivision.smooth(modifiedGeometry, uvSmooth);
                }
                modifiedGeometry.dispose();
                modifiedGeometry = subdividedGeometry;
            }
        }

        return modifiedGeometry;
    }

    /////////////////////////////////////////////////////////////////////////////////////
    /////   Split Hypotenuse
    ////////////////////

    /**
     * Applies one iteration of split subdivision. Splits all triangles at edges shared by coplanar triangles.
     * Starts by splitting at longest shared edge, followed by splitting from that new center edge point to the
     * center of any other shared edges.
     */
    static edgeSplit(geometry) {

        ///// Geometries
        if (! verifyGeometry(geometry)) return geometry;
        const existing = (geometry.index !== null) ? geometry.toNonIndexed() : geometry.clone();
        const split = new THREE.BufferGeometry();

        ///// Attributes
        const attributeList = gatherAttributes(existing);
        const vertexCount = existing.attributes.position.count;
        const posAttribute = existing.getAttribute('position');
        const norAttribute = existing.getAttribute('normal');
        const edgeHashToTriangle = {};
        const triangleEdgeHashes = [];
        const edgeLength = {};
        const triangleExist = [];

        ///// Edges
        for (let i = 0; i < vertexCount; i += 3) {
            // Positions
            _vector0.fromBufferAttribute(posAttribute, i + 0);
            _vector1.fromBufferAttribute(posAttribute, i + 1);
            _vector2.fromBufferAttribute(posAttribute, i + 2);
            _normal.fromBufferAttribute(norAttribute, i);
            const vecHash0 = hashFromVector(_vector0);
            const vecHash1 = hashFromVector(_vector1);
            const vecHash2 = hashFromVector(_vector2);

            // Verify Area
            const triangleSize = _triangle.set(_vector0, _vector1, _vector2).getArea();
            triangleExist.push(! fuzzy(triangleSize, 0));
            if (! triangleExist[i / 3]) {
                triangleEdgeHashes.push([]);
                continue;
            }

            // Calculate Normals
            calcNormal(_normal, _vector0, _vector1, _vector2);
            const normalHash = hashFromVector(_normal);

            // Vertex Hashes
            let hashes = [
                `${vecHash0}_${vecHash1}_${normalHash}`, // [0]: 0to1
                `${vecHash1}_${vecHash0}_${normalHash}`, // [1]: 1to0
                `${vecHash1}_${vecHash2}_${normalHash}`, // [2]: 1to2
                `${vecHash2}_${vecHash1}_${normalHash}`, // [3]: 2to1
                `${vecHash2}_${vecHash0}_${normalHash}`, // [4]: 2to0
                `${vecHash0}_${vecHash2}_${normalHash}`, // [5]: 0to2
            ];

            // Store Edge Hashes
            let index = i / 3;
            for (let j = 0; j < hashes.length; j++) {
                // Attach Triangle Index to Edge Hash
                addToMapArray(edgeHashToTriangle, hashes[j], index);;

                // Edge Length
                if (! edgeLength[hashes[j]]) {
                    if (j === 0 || j === 1) edgeLength[hashes[j]] = _vector0.distanceTo(_vector1);
                    if (j === 2 || j === 3) edgeLength[hashes[j]] = _vector1.distanceTo(_vector2);
                    if (j === 4 || j === 5) edgeLength[hashes[j]] = _vector2.distanceTo(_vector0);
                }
            }

            // Triangle Edge Reference
            triangleEdgeHashes.push([ hashes[0], hashes[2], hashes[4] ]);
        }

        ///// Build Geometry
        attributeList.forEach((attributeName) => {
            const attribute = existing.getAttribute(attributeName);
            if (! attribute) return;
            const newTriangles = 4; /* maximum number of new triangles */
            const arrayLength = (vertexCount * attribute.itemSize) * newTriangles;
            const floatArray = new Float32Array(arrayLength);

            let index = 0;
            let step = attribute.itemSize;
            for (let i = 0; i < vertexCount; i += 3) {
                if (! triangleExist[i / 3]) continue;

                _vector0.fromBufferAttribute(attribute, i + 0);
                _vector1.fromBufferAttribute(attribute, i + 1);
                _vector2.fromBufferAttribute(attribute, i + 2);

                // Check for Shared Edges
                const existingIndex = i / 3;
                const edgeHash0to1 = triangleEdgeHashes[existingIndex][0];
                const edgeHash1to2 = triangleEdgeHashes[existingIndex][1];
                const edgeHash2to0 = triangleEdgeHashes[existingIndex][2];

                const edgeCount0to1 = edgeHashToTriangle[edgeHash0to1].length;
                const edgeCount1to2 = edgeHashToTriangle[edgeHash1to2].length;
                const edgeCount2to0 = edgeHashToTriangle[edgeHash2to0].length;
                const sharedCount = (edgeCount0to1 + edgeCount1to2 + edgeCount2to0) - 3;

                // No Shared Edges
                if (sharedCount === 0) {
                    setTriangle(floatArray, index, step, _vector0, _vector1, _vector2); index += (step * 3);

                // Shared Edges
                } else {
                    const length0to1 = edgeLength[edgeHash0to1];
                    const length1to2 = edgeLength[edgeHash1to2];
                    const length2to0 = edgeLength[edgeHash2to0];

                    // Add New Triangle Positions
                    if ((length0to1 > length1to2 || edgeCount1to2 <= 1) &&
                        (length0to1 > length2to0 || edgeCount2to0 <= 1) && edgeCount0to1 > 1) {
                        _center.copy(_vector0).add(_vector1).divideScalar(2.0);
                        if (edgeCount2to0 > 1) {
                            _midpoint.copy(_vector2).add(_vector0).divideScalar(2.0);
                            setTriangle(floatArray, index, step, _vector0, _center, _midpoint); index += (step * 3);
                            setTriangle(floatArray, index, step, _center, _vector2, _midpoint); index += (step * 3);
                        } else {
                            setTriangle(floatArray, index, step, _vector0, _center, _vector2); index += (step * 3);
                        }
                        if (edgeCount1to2 > 1) {
                            _midpoint.copy(_vector1).add(_vector2).divideScalar(2.0);
                            setTriangle(floatArray, index, step, _center, _vector1, _midpoint); index += (step * 3);
                            setTriangle(floatArray, index, step, _midpoint, _vector2, _center); index += (step * 3);
                        } else {
                            setTriangle(floatArray, index, step, _vector1, _vector2, _center); index += (step * 3);
                        }

                    } else if ((length1to2 > length2to0 || edgeCount2to0 <= 1) && edgeCount1to2 > 1) {
                        _center.copy(_vector1).add(_vector2).divideScalar(2.0);
                        if (edgeCount0to1 > 1) {
                            _midpoint.copy(_vector0).add(_vector1).divideScalar(2.0);
                            setTriangle(floatArray, index, step, _center, _midpoint, _vector1); index += (step * 3);
                            setTriangle(floatArray, index, step, _midpoint, _center, _vector0); index += (step * 3);
                        } else {
                            setTriangle(floatArray, index, step, _vector1, _center, _vector0); index += (step * 3);
                        }
                        if (edgeCount2to0 > 1) {
                            _midpoint.copy(_vector2).add(_vector0).divideScalar(2.0);
                            setTriangle(floatArray, index, step, _center, _vector2, _midpoint); index += (step * 3);
                            setTriangle(floatArray, index, step, _midpoint, _vector0, _center); index += (step * 3);
                        } else {
                            setTriangle(floatArray, index, step, _vector2, _vector0, _center); index += (step * 3);
                        }

                    } else if (edgeCount2to0 > 1) {
                        _center.copy(_vector2).add(_vector0).divideScalar(2.0);
                        if (edgeCount1to2 > 1) {
                            _midpoint.copy(_vector1).add(_vector2).divideScalar(2.0);
                            setTriangle(floatArray, index, step, _vector2, _center, _midpoint); index += (step * 3);
                            setTriangle(floatArray, index, step, _center, _vector1, _midpoint); index += (step * 3);
                        } else {
                            setTriangle(floatArray, index, step, _vector2, _center, _vector1); index += (step * 3);
                        }
                        if (edgeCount0to1 > 1) {
                            _midpoint.copy(_vector0).add(_vector1).divideScalar(2.0);
                            setTriangle(floatArray, index, step, _vector0, _midpoint, _center); index += (step * 3);
                            setTriangle(floatArray, index, step, _midpoint, _vector1, _center); index += (step * 3);
                        } else {
                            setTriangle(floatArray, index, step, _vector0, _vector1, _center); index += (step * 3);
                        }

                    } else {
                        setTriangle(floatArray, index, step, _vector0, _vector1, _vector2); index += (step * 3);
                    }

                }
            }

            // Resize Array
            const reducedCount = (index * 3) / step;
            const reducedArray = new Float32Array(reducedCount);
            for (let i = 0; i < reducedCount; i++) {
                reducedArray[i] = floatArray[i];
            }

            // Set Attribute
            split.setAttribute(attributeName, new THREE.BufferAttribute(reducedArray, attribute.itemSize));
        });

        // Clean Up, Return New Geometry
        existing.dispose();
        return split;
    }

    /////////////////////////////////////////////////////////////////////////////////////
    /////   Flat
    ////////////////////

    /** Applies one iteration of Loop (flat) subdivision (1 triangle split into 4 triangles) */
    static flat(geometry) {

        ///// Geometries
        if (! verifyGeometry(geometry)) return geometry;
        const existing = (geometry.index !== null) ? geometry.toNonIndexed() : geometry.clone();
        const loop = new THREE.BufferGeometry();

        ///// Attributes
        const attributeList = gatherAttributes(existing);
        const vertexCount = existing.attributes.position.count;

        ///// Build Geometry
        attributeList.forEach((attributeName) => {
            const attribute = existing.getAttribute(attributeName);
            if (! attribute) return;
            const newTriangles = 4;
            const arrayLength = (vertexCount * attribute.itemSize) * newTriangles;
            const floatArray = new Float32Array(arrayLength);

            let index = 0;
            let step = attribute.itemSize;
            for (let i = 0; i < vertexCount; i += 3) {

                // Original Vertices
                _vector0.fromBufferAttribute(attribute, i + 0);
                _vector1.fromBufferAttribute(attribute, i + 1);
                _vector2.fromBufferAttribute(attribute, i + 2);

                // Midpoints
                _vec0to1.copy(_vector0).add(_vector1).divideScalar(2.0);
                _vec1to2.copy(_vector1).add(_vector2).divideScalar(2.0);
                _vec2to0.copy(_vector2).add(_vector0).divideScalar(2.0);

                // Add New Triangle Positions
                setTriangle(floatArray, index, step, _vector0, _vec0to1, _vec2to0); index += (step * 3);
                setTriangle(floatArray, index, step, _vector1, _vec1to2, _vec0to1); index += (step * 3);
                setTriangle(floatArray, index, step, _vector2, _vec2to0, _vec1to2); index += (step * 3);
                setTriangle(floatArray, index, step, _vec0to1, _vec1to2, _vec2to0); index += (step * 3);
            }

            loop.setAttribute(attributeName, new THREE.BufferAttribute(floatArray, attribute.itemSize));
        });

        ///// Clean Up
        existing.dispose();
        return loop;
    }

    /////////////////////////////////////////////////////////////////////////////////////
    /////   Smooth
    ////////////////////

    /** Applies one iteration of Loop (smooth) subdivision (1 triangle split into 4 triangles) */
    static smooth(geometry, uvSmooth = false) {

        ///// Geometries
        if (! verifyGeometry(geometry)) return geometry;
        const existing = (geometry.index !== null) ? geometry.toNonIndexed() : geometry.clone();
        const flat = LoopSubdivision.flat(existing);
        const loop = new THREE.BufferGeometry();

        ///// Attributes
        const attributeList = gatherAttributes(existing);
        const vertexCount = existing.attributes.position.count;
        const posAttribute = existing.getAttribute('position');
        const norAttribute = existing.getAttribute('normal');
        const hashToIndex = {};         // Map by hash that contains arrays of index values of same position
        const indexToHash = [];         // Position_Normal hash stored for each index
        const existingNeighbors = {};   // Position hash mapped to Sets of existing vertex neighbors
        const flatOpposites = {};       // Position hash mapped to Sets of new edge point opposites

        ///// Existing Vertex Hashes
        for (let i = 0; i < vertexCount; i += 3) {
            _vertex[0].fromBufferAttribute(posAttribute, i + 0);
            _vertex[1].fromBufferAttribute(posAttribute, i + 1);
            _vertex[2].fromBufferAttribute(posAttribute, i + 2);

            // Map Vertex Hashes
            const positionHashes = [];  // Position only hash
            for (let v = 0; v < 3; v++) {
                // Position
                const positionHash = hashFromVector(_vertex[v]);
                positionHashes.push(positionHash);

                // Normal
                _normal.fromBufferAttribute(norAttribute, i + v);
                // calcNormal(_normal, _vertex[0], _vertex[1], _vertex[2]);
                const normalHash = hashFromVector(_normal);

                // Combined
                const pointHash = `${positionHash}_${normalHash}`;
                addToMapArray(hashToIndex, pointHash, (i + v));
                indexToHash.push(pointHash);
            }

            // Neighbors (Existing Geometry)
            addToObjectSet(existingNeighbors, positionHashes[0], indexToHash[i + 1]);
            addToObjectSet(existingNeighbors, positionHashes[0], indexToHash[i + 2]);
            addToObjectSet(existingNeighbors, positionHashes[1], indexToHash[i + 0]);
            addToObjectSet(existingNeighbors, positionHashes[1], indexToHash[i + 2]);
            addToObjectSet(existingNeighbors, positionHashes[2], indexToHash[i + 0]);
            addToObjectSet(existingNeighbors, positionHashes[2], indexToHash[i + 1]);

            // Midpoints / Opposites
            _vec0to1.copy(_vertex[0]).add(_vertex[1]).divideScalar(2.0);
            _vec1to2.copy(_vertex[1]).add(_vertex[2]).divideScalar(2.0);
            _vec2to0.copy(_vertex[2]).add(_vertex[0]).divideScalar(2.0);
            const hash0to1 = hashFromVector(_vec0to1);
            const hash1to2 = hashFromVector(_vec1to2);
            const hash2to0 = hashFromVector(_vec2to0);
            addToObjectSet(flatOpposites, hash0to1, indexToHash[i + 2]);
            addToObjectSet(flatOpposites, hash1to2, indexToHash[i + 0]);
            addToObjectSet(flatOpposites, hash2to0, indexToHash[i + 1]);
        }

        ///// Build Geometry
        attributeList.forEach((attributeName) => {
            const existingAttribute = existing.getAttribute(attributeName);
            const flatAttribute = flat.getAttribute(attributeName);
            const flatPosition = flat.getAttribute('position');
            if (existingAttribute === undefined || flatAttribute === undefined) return;

            const arrayLength = (flat.attributes.position.count * flatAttribute.itemSize);
            const floatArray = new Float32Array(arrayLength);

            let index = 0;
            for (let i = 0; i < flat.attributes.position.count; i += 3) {

                if (attributeName === 'uv' && ! uvSmooth) {
                    for (let v = 0; v < 3; v++) {
                        _vertex[v].fromBufferAttribute(flatAttribute, i + v);
                    }

                } else { // 'normal', 'position', 'color', etc...
                    for (let v = 0; v < 3; v++) {
                        _vertex[v].fromBufferAttribute(flatAttribute, i + v);
                        _position[v].fromBufferAttribute(flatPosition, i + v);

                        let positionHash = hashFromVector(_position[v]);
                        let neighbors = existingNeighbors[positionHash];
                        let opposites = flatOpposites[positionHash]

                        ///// Adjust Source Vertex
                        if (neighbors && (neighbors instanceof Set)) {
                            const k = neighbors.size;

                            ///// Loop's Formula
                            const beta = 1 / k * ((5/8) - Math.pow((3/8) + (1/4) * Math.cos(2 * Math.PI / k), 2));

                            ///// Warren's Formula
                            // const beta = (k > 3) ? 3 / (8 * k) : ((k === 3) ? 3 / 16 : 0);

                            ///// Stevinz' Formula
                            // const beta = 0.5 / k;

                            ///// Average with Neighbors
                            const startWeight = 1.0 - (beta * k);
                            _vertex[v].multiplyScalar(startWeight);

                            neighbors.forEach(neighborHash => {
                                _average.fromBufferAttribute(existingAttribute, hashToIndex[neighborHash][0]);
                                _average.multiplyScalar(beta);
                                _vertex[v].add(_average);
                            });

                        ///// Newly Added Edge Vertex
                        } else if (opposites && (opposites instanceof Set) && opposites.size === 2) {
                            const k = opposites.size;
                            const beta = 0.125; /* 1/8 */
                            const startWeight = 1.0 - (beta * k);
                            _vertex[v].multiplyScalar(startWeight);

                            opposites.forEach(oppositeHash => {
                                _average.fromBufferAttribute(existingAttribute, hashToIndex[oppositeHash][0]);
                                _average.multiplyScalar(beta);
                                _vertex[v].add(_average);
                            });
                        }
                    }
                }

                // Add New Triangle Position
                setTriangle(floatArray, index, flatAttribute.itemSize, _vertex[0], _vertex[1], _vertex[2]);
                index += (flatAttribute.itemSize * 3);
            }

            loop.setAttribute(attributeName, new THREE.BufferAttribute(floatArray, flatAttribute.itemSize));
        });

        ///// Clean Up
        flat.dispose();
        existing.dispose();
        return loop;
    }

}

/////////////////////////////////////////////////////////////////////////////////////
/////   Local Functions, Hash
/////////////////////////////////////////////////////////////////////////////////////

const _positionShift = Math.pow(10, POSITION_DECIMALS);

/** Compares two numbers to see if they're almost the same */
function fuzzy(a, b, tolerance = 0.00001) {
    return ((a < (b + tolerance)) && (a > (b - tolerance)));
}

/** Generates hash strong from Number */
function hashFromNumber(num, shift = _positionShift) {
    let roundedNumber = round(num * shift);
    if (roundedNumber == 0) roundedNumber = 0; /* prevent -0 (signed 0 can effect Math.atan2(), etc.) */
    return `${roundedNumber}`;
}

/** Generates hash strong from Vector3 */
function hashFromVector(vector, shift = _positionShift) {
    return `${hashFromNumber(vector.x, shift)},${hashFromNumber(vector.y, shift)},${hashFromNumber(vector.z, shift)}`;
}

function round(x) {
    return (x + ((x > 0) ? 0.5 : -0.5)) << 0;
}

/////////////////////////////////////////////////////////////////////////////////////
/////   Local Functions, Maps
/////////////////////////////////////////////////////////////////////////////////////

/** Adds a value into set array */
function addToObjectSet(object, hash, value) {
    if (! object[hash]) object[hash] = new Set();
    object[hash].add(value);
}

/** Adds value into map array */
function addToMapArray(map, key, value) {
    if (! map[key]) map[key] = [];
    map[key].push(value);
}

/////////////////////////////////////////////////////////////////////////////////////
/////   Local Functions, Geometry
/////////////////////////////////////////////////////////////////////////////////////

function calcNormal(target, vec1, vec2, vec3) {
    _temp.subVectors(vec1, vec2);
    target.subVectors(vec2, vec3);
    target.cross(_temp).normalize();
}

function gatherAttributes(geometry) {
    const desired = [ 'position', 'normal', 'uv' ];
    const contains = Object.keys(geometry.attributes);
    const attributeList = Array.from(new Set(desired.concat(contains)));
    return attributeList;
}

function setTriangle(positions, index, step, vec0, vec1, vec2) {
    if (step >= 1) {
        positions[index + 0 + (step * 0)] = vec0.x;
        positions[index + 0 + (step * 1)] = vec1.x;
        positions[index + 0 + (step * 2)] = vec2.x;
    }
    if (step >= 2) {
        positions[index + 1 + (step * 0)] = vec0.y;
        positions[index + 1 + (step * 1)] = vec1.y;
        positions[index + 1 + (step * 2)] = vec2.y;
    }
    if (step >= 3) {
        positions[index + 2 + (step * 0)] = vec0.z;
        positions[index + 2 + (step * 1)] = vec1.z;
        positions[index + 2 + (step * 2)] = vec2.z;
    }
    if (step >= 4) {
        positions[index + 3 + (step * 0)] = vec0.w;
        positions[index + 3 + (step * 1)] = vec1.w;
        positions[index + 3 + (step * 2)] = vec2.w;
    }
}

function verifyGeometry(geometry) {
    if (! geometry.isBufferGeometry) {
        console.warn(`LoopSubdivision: Geometry must be 'BufferGeometry' type`);
        return false;
    }

    if (geometry.attributes.position === undefined) {
        console.warn(`LoopSubdivision: Missing required attribute - 'position'`);
        return false;
    }

    if (geometry.attributes.normal === undefined) {
        geometry.computeVertexNormals();
    }
    return true;
}

/////////////////////////////////////////////////////////////////////////////////////
/////   Exports
/////////////////////////////////////////////////////////////////////////////////////

export { LoopSubdivision };

/////////////////////////////////////////////////////////////////////////////////////
/////   Reference
/////////////////////////////////////////////////////////////////////////////////////
//
// Subdivision Surfaces
//      https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/thesis-10.pdf
//      https://en.wikipedia.org/wiki/Loop_subdivision_surface
//      https://cseweb.ucsd.edu/~alchern/teaching/cse167_fa21/6-3Surfaces.pdf
//
// Original three.js SubdivisionModifier, r124 (Loop)
//      https://github.com/mrdoob/three.js/blob/r124/examples/jsm/modifiers/SubdivisionModifier.js
//
// Original three.js SubdivisionModifier, r59 (Catmull-Clark)
//      https://github.com/mrdoob/three.js/blob/r59/examples/js/modifiers/SubdivisionModifier.js
//
/////////////////////////////////////////////////////////////////////////////////////
/////   License
/////////////////////////////////////////////////////////////////////////////////////
//
// MIT License
//
// Copyright (c) 2022 Stephens Nunnally <@stevinz>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.