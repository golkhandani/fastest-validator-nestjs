import 'reflect-metadata';

import { loadPackage } from '@nestjs/common/utils/load-package.util';
import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  Logger,
} from '@nestjs/common';

import { ValidationError as FastestValidatorError } from 'fastest-validator';

const FastestValidator = loadPackage('fastest-validator', 'f-v-decorators');
const logger = new Logger('FastestValidation', true);

export function helloFvn() {
  return 'hello fastest validation nestjs';
}

const SCHEMA_KEY = Symbol('propertyMetadata');
const COMPILE_FUNC = Symbol('compiler');

export { FastestValidatorError };
export function getSchema(target: any): any {
  return Reflect.getMetadata(SCHEMA_KEY, target.prototype);
}

export function getInnerSchema(target: any): any {
  const schema = Reflect.getMetadata(SCHEMA_KEY, target.prototype);
  delete schema['$$strict'];
  return schema;
}

export function getCompiled(target, messages = {}) {
  let compiled = Reflect.getMetadata(COMPILE_FUNC, target.prototype);
  if (!compiled) {
    logger.log('Compile schema of ' + target.name, 'FastestValidator');
    const v = new FastestValidator({
      useNewCustomCheckerFunction: true,
      messages,
    });
    const s = Reflect.getMetadata(SCHEMA_KEY, target.prototype) || {};
    Reflect.defineMetadata(COMPILE_FUNC, v.compile(s), target.prototype);
    compiled = Reflect.getMetadata(COMPILE_FUNC, target.prototype);
  }
  return compiled;
}

const updateSchema = (
  target: any,
  key: string | symbol,
  options: any,
): void => {
  const schema = Reflect.getMetadata(SCHEMA_KEY, target) || {};
  schema[key] = options;
  Reflect.defineMetadata(SCHEMA_KEY, schema, target);
};

export function ValidationSchema({
  strict = false,
  messages = {},
  condition = null,
} = {}): any {
  return function _Schema<T extends { new (...args: any[]): {} }>(
    target: T,
  ): any {
    updateSchema(target.prototype, '$$strict', strict);
    if (condition !== null) {
      updateSchema(target.prototype, 'condition', {
        custom: condition,
        type: 'custom',
        optional: true,
      });
    }
    getCompiled(target, messages);
    return target;
  };
}

export const decoratorFactory = (mandatory = {}, defaults = {}) => {
  return function (options: any | any[] = {}): any {
    return (target: any, key: string | symbol): any => {
      updateSchema(target, key, { ...defaults, ...options, ...mandatory });
    };
  };
};

export const decoratorFactoryArray = (mandatory = {}, defaults = {}) => {
  return function (options: any | any[] = {}): any {
    if (typeof options.items == 'function') {
      options.items = {
        type: 'object',
        props: getInnerSchema(options.items),
      };
    }
    return (target: any, key: string | symbol): any => {
      updateSchema(target, key, { ...defaults, ...options, ...mandatory });
    };
  };
};

export const Field = decoratorFactory({}, {});
export const Alphabet = decoratorFactory({ type: 'string' }, { empty: false });
export const Boolean = decoratorFactory({ type: 'boolean' });
export const Numeric = decoratorFactory({ type: 'number' }, { convert: true });
export const UUID = decoratorFactory({ type: 'uuid' });
export const ObjectId = decoratorFactory(
  { type: 'string' },
  {
    pattern: /^[a-f\d]{24}$/i,
    messages: {
      stringPattern: "The '{field}' field is not a valid objectId",
    },
  },
);
export const Email = decoratorFactory({ type: 'email' });
export const Date = decoratorFactory({ type: 'date' });
export const Enum = decoratorFactory({ type: 'enum' });
export const ArrayOf = decoratorFactoryArray({ type: 'array' });
export const Any = decoratorFactory({ type: 'any' });
export const EqualTo = decoratorFactory({ type: 'equal' });

export function NestedObject(options: any | any[] = {}): any {
  return (target: any, key: string): any => {
    const t = Reflect.getMetadata('design:type', target, key);
    const props = Object.assign({}, getSchema(t));
    const strict = props.$$strict || false;
    delete props.$$strict;
    updateSchema(target, key, { ...options, props, strict, type: 'object' });
  };
}

export class FastestValidationException extends Error {
  public errors = null;
  public status = 400;
  public code = 4000;
  constructor(errors: any) {
    super();
    this.errors = errors;
    this.message = 'Validation failed';
  }
  public getStatus() {
    return this.status;
  }
}

@Injectable()
export class FastestValidatorPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (metadata.metatype.name === 'Object') {
      return value;
    }
    const compiled = getCompiled(metadata.metatype);
    const result = compiled(value);
    if (result !== true) {
      throw new FastestValidationException(
        this.formatErrors(result as any, metadata.type),
      );
    } else {
      delete value.condition;
      return value;
    }
  }
  formatErrors(
    errors: FastestValidatorError[] = [],
    type: ArgumentMetadata['type'],
  ) {
    return Object.assign(
      {},
      ...errors.map((error) => {
        return {
          [error.field || 'forbiddenKeys']: error.message
            .replace('field', `field in ${type}`)
            .replace("'' ", ''),
        };
      }),
    );
  }
}

export interface FastestValidatorExceptionFilterOption {
  showStack: boolean;
}

@Catch(FastestValidationException)
export class FastestValidatorExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly options: FastestValidatorExceptionFilterOption,
  ) {}
  catch(exception: FastestValidationException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const status = exception.getStatus();
    const env = process.env.NODE_ENV;
    return response.status(status).json({
      status: status,
      message: exception.message,
      ...(this.options.showStack && { stack: exception.stack }),
      payload: exception.errors,
    });
  }
}
