import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import eslint from '@rollup/plugin-eslint';
import { terser } from 'rollup-plugin-terser';
import pkg from './package.json';

export default [
  // browser-friendly UMD build
  {
    input: 'src/index.js',
    output: {
      name: 'uaPayloadParser',
      file: pkg.browser,
      format: 'iife',
    },
    plugins: [
      resolve(), // so Rollup can find `ms`
      commonjs(), // so Rollup can convert `ms` to an ES module
      eslint(),
      babel({
        exclude: ['node_modules/**'],
        babelHelpers: 'bundled',
      }),
      terser(),
    ],
  },

];