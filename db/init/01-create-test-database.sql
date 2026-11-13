-- Runs once, when the database volume is first created.
-- The development database (lab_orders) is created by the image itself;
-- this adds the separate database the tests use.
create database lab_orders_test;
