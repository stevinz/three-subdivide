import dts from 'rollup-plugin-dts';

export default [
	{
		input: './src/index.js',
		treeshake: false,
		external: p => /^three/.test( p ),

		output: {

			name: 'three-subdivide',
			extend: true,
			format: 'umd',
			file: './build/index.umd.cjs',
			sourcemap: true,

			globals: p => /^three/.test( p ) ? 'THREE' : null,

		},

	},
	{
		input: './src/index.js',
		treeshake: false,
		external: p => /^three/.test( p ),

		output: {

			format: 'esm',
			file: './build/index.module.js',
			sourcemap: true,

		},

	},
	{
		input: './src/index.d.ts',
		output: {
			file: './build/index.module.d.ts',
			format: 'es', // Use 'es' format for declaration files
		},
		plugins: [dts()],
	},
];