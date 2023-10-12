# iac-pulumi

# Prerequisites
Pulumi:
AWS account credentials: Access Key, Secret Key, and AWS region
Configuration
To configure the Pulumi stack, create a Pulumi.dev.yaml file in the project directory with the following content:

# yaml
Copy code
config:
  aws:accessKey: <Your_AWS_Access_Key>
  aws:secretKey: <Your_AWS_Secret_Key>
  aws:region: <AWS_Region>
  vpc:cidrBlock: <VPC_CIDR_Block>
Replace <Your_AWS_Access_Key>, <Your_AWS_Secret_Key>, <AWS_Region>, and <VPC_CIDR_Block> with your AWS credentials and desired configuration.
Running the Pulumi Stack
Initialize the Pulumi stack:

# bash
pulumi stack init dev

Install the required Pulumi plugins:
pulumi plugin install aws v2.7.0

Preview the changes:
pulumi preview

# Deploy the infrastructure:
pulumi up
Confirm the deployment by typing "yes" when prompted.

# To remove the created AWS resources:
pulumi destroy

Output
Upon successful deployment, the VPC ID will be available as an output:

VPC ID: <Your_VPC_ID>
Contributing
Feel free to contribute to this project or report issues. We appreciate your contributions to make it better.

Replace <Your_AWS_Access_Key>, <Your_AWS_Secret_Key>, <AWS_Region>, and <VPC_CIDR_Block> with your specific AWS and configuration values. 
