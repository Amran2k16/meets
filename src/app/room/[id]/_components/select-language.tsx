import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React from "react";

const SelectLanguage = () => {
  return (
    <div className="border bg-white p-4">
      <div className="flex gap-4">
        <Select>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Select your language" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Fruits</SelectLabel>
              <SelectItem value="apple">Apple</SelectItem>
              <SelectItem value="banana">Banana</SelectItem>
              <SelectItem value="blueberry">Blueberry</SelectItem>
              <SelectItem value="grapes">Grapes</SelectItem>
              <SelectItem value="pineapple">Pineapple</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select translation" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Fruits</SelectLabel>
              <SelectItem value="apple">Apple</SelectItem>
              <SelectItem value="banana">Banana</SelectItem>
              <SelectItem value="blueberry">Blueberry</SelectItem>
              <SelectItem value="grapes">Grapes</SelectItem>
              <SelectItem value="pineapple">Pineapple</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-4 p-2 border rounded bg-gray-100">
        <p className="text-sm">
          Lorem ipsum dolor, sit amet consectetur adipisicing elit. Rerum
          aperiam dolores dolorem eius! Iure doloremque porro minus earum
          ratione suscipit nisi illum quae dolores error! Minima ea placeat
          ipsam laborum saepe commodi aperiam nesciunt illum error nihil
          praesentium corporis quibusdam explicabo, voluptates debitis assumenda
          iusto sint ipsa sunt quo velit.
        </p>
      </div>
    </div>
  );
};

export default SelectLanguage;
