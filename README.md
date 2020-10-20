
# Fastest Validation Combined with nestjs

```javascript

@ValidationSchema({
  strict: true
})
class NestedEntity {
  @Alphabet({ min: 5 })
  prop7: string;
}

@ValidationSchema({
  strict: true
})
class MyBody {
  @UUID()
  prop1: string;

  @Enum({ values: ["one", "two"] })
  prop2: "one" | "two";

  @Email()
  prop3: string;

  @Numeric({ positive: true })
  prop4: number;

  @NestedObject()
  prop5: NestedEntity;

  @ArrayOf({
    items: NestedEntity
  })
  prop6: NestedEntity[];
}
```


Then in your `controller` add the `class`:

```javascript
@Post()
  postHello(
    @Body() body: MyBody
  ): string {

    return helloFvn();
  }
```

And in the  main.ts` add these lines:

```javascript
app.useGlobalPipes(new FastestValidatorPipe());
app.useGlobalFilters(new FastestValidatorExceptionFilter({
    showStack: false
  })
);

```